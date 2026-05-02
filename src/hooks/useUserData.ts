/**
 * useUserData — 로그인 후 사용자 데이터 일괄 로드 훅
 *
 * 인증 완료 시점에 한 번 실행:
 *   - paw_checkins       → setCheckins
 *   - saved_spots        → setSavedSpots
 *   - spot_visit_summaries → setVisitSummaries
 *   - familiar_dog_signals → setFamiliarSignals
 *
 * DataProvider에 마운트해서 앱 전역에서 store를 채운다.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { PawCheckin, SavedSpot, SpotVisitSummary, FamiliarDogSignal } from '@/types';

export function useUserData() {
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const isAuthLoading   = useAppStore(s => s.isAuthLoading);
  const activeDog       = useAppStore(s => s.activeDog);

  const setCheckins       = useAppStore(s => s.setCheckins);
  const setSavedSpots     = useAppStore(s => s.setSavedSpots);
  const setVisitSummaries = useAppStore(s => s.setVisitSummaries);
  const setFamiliarSignals = useAppStore(s => s.setFamiliarSignals);

  // 한 번만 로드하도록 dog_id 추적
  const loadedDogRef = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !activeDog?.dog_id) return;
    if (loadedDogRef.current === activeDog.dog_id) return; // 이미 로드됨

    loadedDogRef.current = activeDog.dog_id;
    loadUserData(activeDog.dog_id);
  }, [isAuthenticated, isAuthLoading, activeDog?.dog_id]);

  async function loadUserData(dogId: string) {
    const [checkinRes, savedRes, summaryRes, familiarRes] = await Promise.allSettled([
      // 발도장 목록 (최근 200개)
      supabase
        .from('paw_checkins')
        .select('*')
        .eq('dog_id', dogId)
        .order('checked_in_at', { ascending: false })
        .limit(200),

      // 저장 스팟
      supabase
        .from('saved_spots')
        .select('*')
        .eq('dog_id', dogId),

      // 방문 요약
      supabase
        .from('spot_visit_summaries')
        .select('*')
        .eq('dog_id', dogId),

      // 익숙한 강아지 신호 (exposure_allowed=true만)
      supabase
        .from('familiar_dog_signals')
        .select('*')
        .eq('exposure_allowed', true)
        .limit(100),
    ]);

    if (checkinRes.status === 'fulfilled' && checkinRes.value.data) {
      const mapped: PawCheckin[] = checkinRes.value.data.map((c: any) => ({
        checkin_id: c.checkin_id,
        dog_id: c.dog_id,
        spot_id: c.spot_id,
        checked_in_at: c.checked_in_at,
        feeling_tags: c.feeling_tags ?? [],
        note: c.note ?? undefined,
        photo_url: c.photo_url ?? undefined,
        visibility_level: c.visibility_level,
        source_type: c.source_type,
        is_valid_for_aggregate: c.is_valid_for_aggregate,
        created_at: c.created_at,
      }));
      setCheckins(mapped);
    }

    if (savedRes.status === 'fulfilled' && savedRes.value.data) {
      const mapped: SavedSpot[] = savedRes.value.data.map((s: any) => ({
        saved_spot_id: s.saved_spot_id,
        dog_id: s.dog_id,
        spot_id: s.spot_id,
        saved_type: s.saved_type,
        saved_at: s.saved_at,
      }));
      setSavedSpots(mapped);
    }

    if (summaryRes.status === 'fulfilled' && summaryRes.value.data) {
      const mapped: SpotVisitSummary[] = summaryRes.value.data.map((s: any) => ({
        summary_id: s.summary_id,
        dog_id: s.dog_id,
        spot_id: s.spot_id,
        first_visit_at: s.first_visit_at,
        last_visit_at: s.last_visit_at,
        visit_count: s.visit_count,
        last_30d_visit_count: s.last_30d_visit_count,
        regular_status: s.regular_status,
        last_visible_tags: s.last_visible_tags ?? undefined,
        updated_at: s.updated_at,
      }));
      setVisitSummaries(mapped);
    }

    if (familiarRes.status === 'fulfilled' && familiarRes.value.data) {
      const mapped: FamiliarDogSignal[] = familiarRes.value.data.map((f: any) => ({
        familiar_signal_id: f.familiar_signal_id,
        spot_id: f.spot_id,
        visible_dog_id: f.visible_dog_id,
        recent_visible_checkin_count: f.recent_visible_checkin_count,
        recent_last_seen_at: f.recent_last_seen_at,
        exposure_allowed: f.exposure_allowed,
        updated_at: f.updated_at,
      }));
      setFamiliarSignals(mapped);
    }
  }
}
