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
import type { User } from '@/types';

export function useAuth() {
  const setUser = useAppStore(s => s.setUser);
  const setActiveDog = useAppStore(s => s.setActiveDog);
  const setAuthLoading = useAppStore(s => s.setAuthLoading);

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
    const { data: dogsData } = await supabase
      .from('dogs')
      .select('*')
      .eq('user_id', userData.user_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (dogsData && dogsData.length > 0) {
      const dog = dogsData[0];
      setActiveDog({
        dog_id: dog.dog_id,
        user_id: dog.user_id,
        name: dog.name,
        avatar_url: dog.avatar_url,
        size: dog.size,
        age_group: dog.age_group,
        temperament_tags: dog.temperament_tags,
        walking_style_tags: dog.walking_style_tags,
        is_active: dog.is_active,
        created_at: dog.created_at,
      });
    }

    // last_active_at 갱신 (비동기, 에러 무시)
    supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('user_id', userData.user_id)
      .then(() => {});
  }
}
