/**
 * useNearbySpots — 주변 스팟 조회 훅
 *
 * spots-nearby Edge Function을 호출해 현재 위치 기준 스팟 목록을 가져온다.
 * - currentLocation이 바뀌면 자동으로 fetch
 * - fetch 결과를 AppStore의 spots에도 동기화해 getHomeCards()가 실제 데이터를 쓸 수 있도록 함
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { SpotCardViewModel, Spot } from '@/types';

interface UseNearbySpotsReturn {
  spots: SpotCardViewModel[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useNearbySpots(radiusMeters = 3000): UseNearbySpotsReturn {
  const [spots, setSpots] = useState<SpotCardViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLocation = useAppStore(s => s.currentLocation);
  const activeDog = useAppStore(s => s.activeDog);
  const setStoreSpots = useAppStore(s => s.setSpots);

  // 이전 위치 저장 — 동일 위치 중복 fetch 방지
  const prevLocationRef = useRef<{ lat: number; lng: number } | null>(null);

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

      const rawList: any[] = data.spots ?? [];

      // SpotCardViewModel (지도/목록 UI용)
      const mapped: SpotCardViewModel[] = rawList.map((s: any) => ({
        spotId: s.spot_id,
        name: s.name,
        category: s.category,
        latitude: s.latitude,
        longitude: s.longitude,
        addressText: s.address_text ?? null,
        neighborhood: s.neighborhood ?? null,
        coverImageUrl: s.cover_image_url ?? null,
        distanceM: s.distance_m,
        checkinCount: s.checkin_count,
        topFeelingTags: s.top_feeling_tags ?? [],
        atmosphereState: s.atmosphere_state ?? 'unknown',
        userVisitCount: s.user_visit_count ?? 0,
        lastVisitAt: s.last_visit_at ?? null,
        regularStatus: s.regular_status ?? 'none',
        savedType: s.saved_type ?? null,
      }));
      setSpots(mapped);

      // Spot[] (getHomeCards 등 store 계산용) — store에도 동기화
      const storeSpots: Spot[] = rawList.map((s: any) => ({
        spot_id: s.spot_id,
        name: s.name,
        category: s.category,
        latitude: s.latitude,
        longitude: s.longitude,
        address_text: s.address_text ?? undefined,
        neighborhood: s.neighborhood ?? undefined,
        cover_image_url: s.cover_image_url ?? undefined,
        opening_hours: s.opening_hours ?? undefined,
        features: s.features ?? undefined,
        description: s.description ?? undefined,
        caution: s.caution ?? undefined,
        status: 'active' as const,
        created_source: (s.created_source ?? 'seed') as Spot['created_source'],
        created_at: s.created_at ?? new Date().toISOString(),
      }));
      setStoreSpots(storeSpots);

    } catch (err: any) {
      console.error('useNearbySpots error:', err);
      setError('스팟을 불러오지 못했어요');
    } finally {
      setIsLoading(false);
    }
  }, [currentLocation, activeDog, radiusMeters, setStoreSpots]);

  // 위치가 처음 설정되거나 의미있게 변할 때 자동 fetch
  useEffect(() => {
    if (!currentLocation) return;

    const prev = prevLocationRef.current;
    // 50m 이상 이동했을 때만 re-fetch
    if (prev) {
      const deltaLat = Math.abs(currentLocation.latitude - prev.lat);
      const deltaLng = Math.abs(currentLocation.longitude - prev.lng);
      if (deltaLat < 0.0005 && deltaLng < 0.0005) return; // ~50m 미만
    }

    prevLocationRef.current = { lat: currentLocation.latitude, lng: currentLocation.longitude };
    refresh();
  }, [currentLocation]);

  return { spots, isLoading, error, refresh };
}
