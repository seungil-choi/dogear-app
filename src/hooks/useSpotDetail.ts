/**
 * useSpotDetail — 스팟 상세 뷰모델 훅
 *
 * spot-detail Edge Function을 호출해 스팟 상세 정보를 가져온다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

  // 요청 순번 — 늦게 도착한 이전 응답이 최신 결과를 덮지 않게 한다.
  //   활성 강아지가 바뀌면 fetchDetail이 재생성돼 두 요청이 겹칠 수 있고,
  //   화면을 떠난 뒤 응답이 와도 언마운트된 컴포넌트에 setState가 걸린다.
  //   useNearbySpots·useInteractedSpots에는 이미 있던 가드가 여기만 빠져 있었다.
  const reqIdRef = useRef(0);
  useEffect(() => () => { reqIdRef.current++; }, []);   // 언마운트 시 진행 중 요청 무효화

  const fetchDetail = useCallback(async () => {
    if (!spotId) return;

    const myReq = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ spotId });
      if (activeDog?.dog_id) params.set('dogId', activeDog.dog_id);

      const { data: raw, error: fnError } = await supabase.functions.invoke(
        `spot-detail?${params.toString()}`,
        { method: 'GET' }
      );

      if (myReq !== reqIdRef.current) return;   // 더 최신 요청이 있다 → 이 결과는 버린다
      if (fnError) throw fnError;
      if (!raw) throw new Error('No data');

      setData(raw as SpotDetailApiViewModel);
    } catch (err: any) {
      if (myReq !== reqIdRef.current) return;
      console.error('useSpotDetail error:', err);
      setError('스팟 정보를 불러오지 못했어요');
    } finally {
      if (myReq === reqIdRef.current) setIsLoading(false);
    }
  }, [spotId, activeDog?.dog_id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { data, isLoading, error, refresh: fetchDetail };
}
