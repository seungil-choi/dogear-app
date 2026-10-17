/**
 * useAccountStatusRefresh — 앱으로 돌아올 때 계정 상태(정지·탈퇴)를 다시 읽는다.
 *
 * 예전엔 users.status를 로그인·앱 시작 때 한 번만 읽었다. 그래서 사용 중에 운영자가
 * 이용을 정지해도 앱을 완전히 껐다 켜기 전까지 그대로 쓸 수 있었다(2026-10-16 감사 P2-22).
 * 포그라운드 복귀 때 status만 가볍게 다시 읽어 store에 반영하면, AuthGate와
 * Stack.Protected가 정지 안내 화면으로 보낸다. 정지가 풀린 경우도 같은 경로로 돌아온다.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { signOutEverywhereOrLocal } from '@/lib/signOut';

/** 너무 잦은 조회를 막는 최소 간격 */
const MIN_INTERVAL_MS = 60_000;

export function useAccountStatusRefresh() {
  const lastRef = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      const user = useAppStore.getState().user;
      if (!user) return;
      if (Date.now() - lastRef.current < MIN_INTERVAL_MS) return;
      lastRef.current = Date.now();

      const { data, error } = await supabase
        .from('users')
        .select('status')
        .eq('user_id', user.user_id)
        .maybeSingle();
      // 오프라인 등으로 못 읽으면 지금 상태를 유지한다(잘못 내보내는 것보다 낫다)
      if (error) return;
      // 오류 없이 행이 없다 = 운영자가 계정을 영구 삭제했다 → 이 기기 세션을 끝낸다(QA 10/17).
      // (토큰은 만료 전까지 유효해서, 그냥 두면 최대 1시간 앱을 계속 쓴다)
      if (!data) {
        // 토큰 갱신이 일시적으로 실패하면 익명 키로 조회돼 RLS가 0행을 돌려준다 — 그때는 내보내지 않는다.
        // 살아 있는 세션이 이 사용자의 것일 때만 '삭제됨'으로 본다(QA 2사이클 10/17)
        const { data: s } = await supabase.auth.getSession();
        if (!s.session || s.session.user.id !== user.auth_id) return;
        await signOutEverywhereOrLocal().catch(() => {});
        useAppStore.getState().logout();
        return;
      }

      const cur = useAppStore.getState().user;
      if (cur && cur.user_id === user.user_id && cur.status !== data.status) {
        useAppStore.getState().setUser({ ...cur, status: data.status });
      }
    });
    return () => sub.remove();
  }, []);
}
