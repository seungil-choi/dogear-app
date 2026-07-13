/**
 * useAuth — Supabase 인증 상태 훅
 *
 * - 앱 시작 시 세션 복원
 * - auth.users 변화 감지 → users 테이블 연동
 * - AppStore에 user/dog 상태 반영
 */

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
      }
      setAuthLoading(false);
    });

    // 인증 상태 변화 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await loadUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setActiveDog(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadUserProfile(authId: string) {
    // users 테이블 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single();

    if (userError || !userData) {
      console.warn('User record not found for auth_id:', authId);
      return;
    }

    const user: User = {
      user_id: userData.user_id,
      login_type: userData.login_type,
      status: userData.status,
      last_active_at: userData.last_active_at,
      created_at: userData.created_at,
    };
    setUser(user);

    // 강아지 목록 조회 → 첫 번째 활성 강아지를 active로 설정
    //   soft-deleted 강아지(deleted_at NOT NULL)는 제외 — 30일 grace 동안 숨김
    const { data: dogsData } = await supabase
      .from('dogs')
      .select('*')
      .eq('user_id', userData.user_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

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
      setActiveDog(mappedDogs[0]);
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
