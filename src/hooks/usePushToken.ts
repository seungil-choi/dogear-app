/**
 * usePushToken — Expo Push Token 등록 훅
 *
 * 권한 요청 → 토큰 발급 → Supabase push_tokens에 저장
 *
 * 호출 시점: 로그인 직후 (_layout.tsx의 DataProvider에서 마운트)
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

import { IS_REAL_AUTH } from '../config/env';

// 알림 표시 동작 설정 (앱 활성 시에도 알림 노출)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushToken() {
  const user = useAppStore(s => s.user);
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const pushEnabled = useAppStore(s => s.pushEnabled);

  useEffect(() => {
    if (!IS_REAL_AUTH) return;
    if (!isAuthenticated || !user?.user_id) return;
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return; // 시뮬레이터는 알림 미지원
    if (!pushEnabled) return;     // 사용자가 알림을 끈 상태면 토큰 등록 안 함

    registerToken(user.user_id).catch(err => {
      console.warn('push token register failed:', err);
    });
  }, [isAuthenticated, user?.user_id, pushEnabled]);
}

/** 서버에서 이 사용자의 푸시 토큰 제거 — 알림 끄기 시 호출 (실제 발송 차단) */
export async function unregisterPushTokens(userId: string) {
  try {
    await supabase.from('push_tokens').delete().eq('user_id', userId);
  } catch (err) {
    console.warn('push token unregister failed:', err);
  }
}

/** 현재 기기에서 즉시 토큰 등록 — 알림 켜기 시 호출 (권한 이미 허용된 경우) */
export async function registerPushTokenNow(userId: string) {
  if (!IS_REAL_AUTH) return;
  if (Platform.OS === 'web' || !Device.isDevice) return;
  await registerToken(userId);
}

async function registerToken(userId: string) {
  // 1. 권한 "확인"만 — 자동 요청 금지 (Android 13 권장: 권한 요청은 온보딩 permissions
  //    화면 / 설정 알림 토글 등 명시적 사용자 행동에서만). 여기선 이미 허용된 경우에만 토큰 등록.
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing !== 'granted') return; // 미허용 → 조용히 종료 (런치 시 자동 프롬프트 안 띄움)

  // 2. Android 채널 설정
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C47848',
    });
  }

  // 3. 토큰 발급
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;

  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoToken = tokenData.data;

  // 4. Supabase에 upsert
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        expo_token: expoToken,
        platform: Platform.OS,
        device_id: Device.osInternalBuildId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'expo_token' }
    );

  if (error) {
    console.warn('push_tokens upsert error:', error);
  }
}
