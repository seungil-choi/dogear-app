/**
 * useNearbySpots — 주변 스팟 조회 훅
 *
 * spots-nearby Edge Function을 호출해 현재 위치 기준 스팟 목록을 가져온다.
 * AppStore의 위치 정보를 사용한다.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { SpotCardViewModel } from '@/types';

interface UseNearbySpotsReturn {
  spots: SpotCardViewModel[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useNearbySpots(radiusMeters = 2000): UseNearbySpotsReturn {
  const [spots, setSpots] = useState<SpotCardViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLocation = useAppStore(s => s.currentLocation);
  const activeDog = useAppStore(s => s.activeDog);

  const refresh = useCallback(async () => {
    if (!currentLocation) {
      setError('위치 정보를 가져올 수 없어요');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('spots-nearby', {
        body: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radiusMeters,
          dogId: activeDog?.dog_id ?? null,
        },
      });

      if (fnError) throw fnError;

      const mapped: SpotCardViewModel[] = (data.spots ?? []).map((s: any) => ({
        spotId: s.spot_id,
        name: s.name,
        category: s.category,
        latitude: s.latitude,
        longitude: s.longitude,
        addressText: s.address_text,
        neighborhood: s.neighborhood,
        coverImageUrl: s.cover_image_url,
        distanceM: s.distance_m,
        checkinCount: s.checkin_count,
        topFeelingTags: s.top_feeling_tags ?? [],
        atmosphereState: s.atmosphere_state ?? 'unknown',
        userVisitCount: s.user_visit_count ?? 0,
        lastVisitAt: s.last_visit_at,
        regularStatus: s.regular_status ?? 'none',
        savedType: s.saved_type ?? null,
      }));

      setSpots(mapped);
    } catch (err: any) {
      console.error('useNearbySpots error:', err);
      setError('스팟을 불러오지 못했어요');
    } finally {
      setIsLoading(false);
    }
  }, [currentLocation, activeDog, radiusMeters]);

  return { spots, isLoading, error, refresh };
}
