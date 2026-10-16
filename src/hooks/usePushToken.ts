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
import { reportError } from '../utils/errorReporter';
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
      // ⚠️ console.warn만 남기던 자리. google-services.json이 빠져 출시 후 토큰이 한 건도
      //    등록되지 않았는데(2026-10-16 발견) 아무도 몰랐다 — 실패는 서버 오류 기록으로 보낸다.
      reportError(new Error(`push token register failed: ${err?.message ?? err}`), 'handled');
    });
  }, [isAuthenticated, user?.user_id, pushEnabled]);
}

/** 이 기기에서 마지막으로 등록한 토큰 — 로그아웃·알림 끄기 때 '이 기기만' 지우는 데 쓴다 */
let thisDeviceToken: string | null = null;

/**
 * 이 기기의 푸시 토큰만 서버에서 지운다 — 로그아웃·탈퇴·알림 끄기에서 부른다.
 * ⚠️ 예전엔 알림 끄기가 user_id 기준으로 **모든 기기**의 토큰을 지웠고, 로그아웃은 아예 지우지 않아
 *    로그아웃한 기기로 이전 계정 알림이 계속 왔다(2026-10-16 감사). 세션을 끊기 **전에** 불러야 RLS가 통과한다.
 * 토큰을 모르면(앱 재시작 직후 등) 지금 기기 토큰을 다시 읽는다. 실패는 기록한다.
 */
export async function removeThisDevicePushToken(): Promise<void> {
  if (!IS_REAL_AUTH || Platform.OS === 'web' || !Device.isDevice) return;
  try {
    let token = thisDeviceToken;
    if (!token) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;   // 권한이 없으면 등록된 토큰도 없다
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    }
    const { error } = await supabase.from('push_tokens').delete().eq('expo_token', token);
    if (error) throw error;
    thisDeviceToken = null;
  } catch (err: any) {
    reportError(new Error(`push token remove failed: ${err?.message ?? err}`), 'handled');
  }
}

/** 알림 끄기 — 이 기기만 끈다(다른 기기의 알림은 그대로) */
export async function unregisterPushTokens(_userId: string) {
  await removeThisDevicePushToken();
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
      lightColor: '#FF7A30',
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
  thisDeviceToken = expoToken;

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
    reportError(new Error(`push_tokens upsert error: ${error.message}`), 'handled');
  }
}
