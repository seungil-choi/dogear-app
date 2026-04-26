/**
 * useSpotDetail — 스팟 상세 뷰모델 훅
 *
 * spot-detail Edge Function을 호출해 스팟 상세 정보를 가져온다.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { SpotCategory, AtmosphereState, RegularStatus, SavedType, FeelingTag } from '@/types';

/** Edge Function spot-detail 응답 기반 뷰모델 */
export interface SpotDetailApiViewModel {
  spot: {
    spot_id: string;
    name: string;
    category: SpotCategory;
    latitude: number;
    longitude: number;
    address_text: string | null;
    neighborhood: string | null;
    cover_image_url: string | null;
  };
  atmosphere: {
    state: AtmosphereState;
    top_feeling_tags: FeelingTag[];
    recent_checkin_count: number;
    total_checkin_count: number;
  };
  user_relation: {
    visit_count: number;
    last_visit_at: string | null;
    first_visit_at: string | null;
    regular_status: RegularStatus;
    saved_type: SavedType | null;
    saved_at: string | null;
  } | null;
  familiar_dogs: {
    dog_id: string;
    name: string;
    avatar_url: string | null;
    size: string;
    temperament_tags: string[];
    recent_checkin_count: number;
    last_seen_at: string;
  }[];
  recent_traces: {
    checkin_id: string;
    feeling_tags: FeelingTag[];
    note: string | null;
    photo_url: string | null;
    checked_in_at: string;
  }[];
}

interface UseSpotDetailReturn {
  data: SpotDetailApiViewModel | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSpotDetail(spotId: string): UseSpotDetailReturn {
  const [data, setData] = useState<SpotDetailApiViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeDog = useAppStore(s => s.activeDog);

  const fetchDetail = useCallback(async () => {
    if (!spotId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ spotId });
      if (activeDog?.dog_id) params.set('dogId', activeDog.dog_id);

      const { data: raw, error: fnError } = await supabase.functions.invoke(
        `spot-detail?${params.toString()}`,
        { method: 'GET' }
      );

      if (fnError) throw fnError;
      if (!raw) throw new Error('No data');

      setData(raw as SpotDetailApiViewModel);
    } catch (err: any) {
      console.error('useSpotDetail error:', err);
      setError('스팟 정보를 불러오지 못했어요');
    } finally {
      setIsLoading(false);
    }
  }, [spotId, activeDog?.dog_id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { data, isLoading, error, refresh: fetchDetail };
}
