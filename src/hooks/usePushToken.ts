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

const IS_REAL_AUTH = process.env.EXPO_PUBLIC_DEV_SEED !== 'true';

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

  useEffect(() => {
    if (!IS_REAL_AUTH) return;
    if (!isAuthenticated || !user?.user_id) return;
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return; // 시뮬레이터는 알림 미지원

    registerToken(user.user_id).catch(err => {
      console.warn('push token register failed:', err);
    });
  }, [isAuthenticated, user?.user_id]);
}

async function registerToken(userId: string) {
  // 1. 권한 요청
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return; // 사용자가 거절 → 조용히 종료

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
