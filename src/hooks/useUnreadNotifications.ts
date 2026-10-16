/**
 * 안 읽은 알림이 있는가 — 홈 종 아이콘의 점 표시용 (planning/38 알림함 고도화)
 * 홈에 돌아올 때마다(알림함에서 읽고 돌아온 경우 포함) 다시 센다. 실패하면 점을 숨긴다.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { IS_REAL_AUTH } from '../config/env';
import { useAppStore } from '../store/useAppStore';

export function useHasUnreadNotifications(): boolean {
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const [has, setHas] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!IS_REAL_AUTH || !isAuthenticated) { setHas(false); return; }
    let alive = true;
    supabase
      .from('notifications')
      .select('notification_id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count, error }) => { if (alive) setHas(!error && (count ?? 0) > 0); });
    return () => { alive = false; };
  }, [isAuthenticated]));
  return has;
}
