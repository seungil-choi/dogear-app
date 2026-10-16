/**
 * 푸시 알림을 눌렀을 때 해당 화면으로 보낸다.
 *
 * 전에는 응답 리스너가 없어서 푸시를 눌러도 앱만 열렸다. 알림함과 같은 규칙으로 보낸다:
 *   notice_id → 공지 상세 / action_id → 조치 내역 / spot_id → 장소 상세
 *
 * 앱이 꺼진 상태에서 눌렀으면(콜드 스타트) 로그인 복원과 루트 네비게이터 마운트를 기다렸다가 보낸다.
 * 같은 알림으로 두 번 이동하지 않게 응답 id를 기억한다.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

type TapData = { notice_id?: string; action_id?: string; spot_id?: string };

function pathFor(data: TapData | undefined): string | null {
  if (!data) return null;
  if (data.notice_id) return `/notices/${data.notice_id}`;
  if (data.action_id) return `/moderation-notices?actionId=${data.action_id}`;
  if (data.spot_id) return `/spot/${data.spot_id}`;
  return null;
}

export function useNotificationTap() {
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const [pending, setPending] = useState<string | null>(null);
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const take = (res: Notifications.NotificationResponse | null) => {
      if (!res) return;
      const key = res.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      const path = pathFor(res.notification.request.content.data as TapData);
      if (path) setPending(path);
    };
    // 콜드 스타트: 앱을 연 알림
    Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
    // 앱이 떠 있는 동안 누른 알림
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending || !navReady || !isAuthenticated) return;
    const path = pending;
    setPending(null);
    router.push(path as any);
  }, [pending, navReady, isAuthenticated, router]);
}
