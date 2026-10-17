/**
 * useAuth — Supabase 인증 상태 훅
 *
 * - 앱 시작 시 세션 복원
 * - auth.users 변화 감지 → users 테이블 연동
 * - AppStore에 user/dog 상태 반영
 */

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { reportError } from '../utils/errorReporter';
import { useAppStore } from '@/store/useAppStore';
import type { User, Dog } from '@/types';

export function useAuth() {
  const setUser = useAppStore(s => s.setUser);
  const setActiveDog = useAppStore(s => s.setActiveDog);
  const setDogs = useAppStore(s => s.setDogs);
  const setAuthLoading = useAppStore(s => s.setAuthLoading);
  const completeOnboarding = useAppStore(s => s.completeOnboarding);

  useEffect(() => {
    setAuthLoading(true);

    // 현재 세션 확인
    //  ⚠️ loadUserProfile은 네트워크 호출(users/dogs) — 오프라인/실패 시 reject 가능.
    //  catch/finally가 없으면 setAuthLoading(false)에 도달하지 못해 스플래시가 영구 정지됨.
    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        if (session?.user) {
          await loadUserProfile(session.user.id);
        } else if (error) {
          // 토큰 갱신이 네트워크 때문에 실패한 경우다 — 로그아웃시키지 않는다. 연결되면
          // supabase가 다시 갱신해 SIGNED_IN/TOKEN_REFRESHED로 돌아온다(2026-10-17 QA)
          reportError(new Error(`restore session error: ${error.message}`), 'handled');
        } else {
          // 세션이 없는데 persist로 로그인 상태가 남아있으면 고스트 세션(토큰 만료·revoke).
          // 그대로 두면 RLS로 전 화면이 빈 채 "로그인됨"으로 갇힘 → 정리해 로그인으로 유도.
          const st = useAppStore.getState();
          if (st.isAuthenticated) st.logout();
        }
      })
      .catch((e) => {
        reportError(new Error(`restore session failed: ${e?.message ?? e}`), 'handled');
      })
      .finally(() => {
        setAuthLoading(false);
      });

    // 인증 상태 변화 구독
    // ⚠️ 콜백 안에서 Supabase를 await하지 않는다 — 공식 문서가 교착 위험을 경고하는 패턴이다.
    //    다음 틱으로 넘기고 실패는 기록한다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === 'SIGNED_IN' || (event === 'TOKEN_REFRESHED' && !useAppStore.getState().user)) && session?.user) {
          const authId = session.user.id;
          setTimeout(() => {
            loadUserProfile(authId).catch((e: any) =>
              reportError(new Error(`loadUserProfile failed: ${e?.message ?? e}`), 'handled'));
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          // 세션 만료·원격 revoke로 끊긴 경우도 여기로 온다. 예전엔 user만 비워
          // 이전 사용자의 발도장·저장 장소·차단 목록이 남았다(다른 계정으로 로그인하면 보였다).
          useAppStore.getState().logout();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadUserProfile(authId: string) {
    // users + 강아지 목록을 한 번에 가져온다(dogs.user_id → users.user_id FK 하나뿐이라 임베드가 모호하지 않다).
    // 예전엔 users 조회 → dogs 조회를 순서대로 두 번 왕복했다 — 콜드 스타트의 스플래시 대기 시간에 그대로 얹힌다.
    // 임베드 조회가 실패하면(스키마·정책 변경 등) 예전 2단계 경로로 조용히 내려간다.
    let userData: any = null;
    let userError: any = null;
    let dogsData: any[] | null = null;
    {
      const res = await supabase
        .from('users')
        .select('*, dogs(*)')
        .eq('auth_id', authId)
        .eq('dogs.is_active', true)
        .is('dogs.deleted_at', null)
        .order('created_at', { referencedTable: 'dogs', ascending: true })
        .single();
      if (!res.error && res.data) {
        const { dogs: embedded, ...rest } = res.data as any;
        userData = rest;
        dogsData = Array.isArray(embedded) ? embedded : [];
      } else {
        console.warn('users+dogs embed failed, falling back:', res.error?.message);
        const fallback = await supabase.from('users').select('*').eq('auth_id', authId).single();
        userData = fallback.data;
        userError = fallback.error;
      }
    }

    if (userError || !userData) {
      console.warn('User record not found for auth_id:', authId);
      return;
    }

    const user: User = {
      user_id: userData.user_id,
      auth_id: userData.auth_id ?? authId,
      login_type: userData.login_type,
      status: userData.status,
      last_active_at: userData.last_active_at,
      created_at: userData.created_at,
    };
    setUser(user);

    // 강아지 목록 → 첫 번째 활성 강아지를 active로 설정
    //   soft-deleted 강아지(deleted_at NOT NULL)는 제외 — 30일 grace 동안 숨김
    //   (임베드가 실패해 폴백한 경우에만 여기서 따로 조회)
    if (dogsData === null) {
      const res = await supabase
        .from('dogs')
        .select('*')
        .eq('user_id', userData.user_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      dogsData = res.data;
    }

    if (dogsData && dogsData.length > 0) {
      completeOnboarding(); // 강아지가 있으면 온보딩 이미 완료한 것
      const mappedDogs: Dog[] = dogsData.map((d: any) => ({
        dog_id: d.dog_id,
        user_id: d.user_id,
        name: d.name,
        avatar_url: d.avatar_url ?? undefined,
        breed: d.breed ?? undefined,
        weight_kg: d.weight_kg ?? undefined,
        size: d.size,
        age_group: d.age_group,
        temperament_tags: d.temperament_tags ?? [],
        walking_style_tags: d.walking_style_tags ?? [],
        is_active: d.is_active,
        created_at: d.created_at,
      }));
      setDogs(mappedDogs);
      // 재시작 시 마지막으로 선택한 강아지 유지 — 없거나 삭제됐으면 첫 강아지.
      const persistedActive = useAppStore.getState().activeDog;
      const keep = persistedActive && mappedDogs.find(d => d.dog_id === persistedActive.dog_id);
      setActiveDog(keep ?? mappedDogs[0]);
    } else {
      // 강아지가 없어도 온보딩 완료 플래그는 되돌리지 않는다.
      //   (건너뛰기/삭제 후에도 사용자가 마이 탭에서 로그아웃·탈퇴·설정에 접근해야 함)
      //   dog-setup으로 강제 복귀시키면 그 화면들에 도달할 수 없어 막힘 → 프로필 탭에서 비차단 등록 유도로 처리
      setDogs([]);
      setActiveDog(null);
    }

    // last_active_at 갱신 (비동기, 에러 무시)
    supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('user_id', userData.user_id)
      .then(() => {});
  }
}
