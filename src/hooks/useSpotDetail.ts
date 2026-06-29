/**
 * useSpotDetail — 스팟 상세 뷰모델 훅
 *
 * spot-detail Edge Function을 호출해 스팟 상세 정보를 가져온다.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { SpotDetailApiViewModel } from '@/types';

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
