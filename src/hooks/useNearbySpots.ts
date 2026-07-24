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
import { registerRefreshHandler } from '@/utils/refreshBus';
import type { SpotCardViewModel, Spot } from '@/types';

// 위치가 없거나 주변에 스팟이 없을 때(비수도권 등) 홈이 비지 않도록 쓰는 추천 폴백 중심.
// 서비스 커버리지 중심(서울 시청) 기준 넉넉한 반경으로 대표 스팟을 채운다.
const FALLBACK_CENTER = { latitude: 37.5665, longitude: 126.9780 };
const FALLBACK_RADIUS_M = 50000;
const FALLBACK_LIMIT = 30;

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
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const activeDog = useAppStore(s => s.activeDog);
  const setStoreSpots = useAppStore(s => s.setSpots);
  const setSpotAggregates = useAppStore(s => s.setSpotAggregates);
  const setSpotsLoading = useAppStore(s => s.setSpotsLoading);

  // 이전 위치 저장 — 동일 위치 중복 fetch 방지
  const prevLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // 요청 순번 — 최초 폴백 호출과 위치기반 호출이 경쟁할 때 stale 결과가 최신을 덮지 않도록
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    // 로그인 전에는 fetch하지 않는다 — spots-nearby는 인증 필수라 401만 나고,
    // 그 빈 결과가 남아 로그인 직후 홈 추천이 비어 보이던 원인.
    if (!isAuthenticated) return;
    const myReq = ++reqIdRef.current;
    setIsLoading(true);
    setSpotsLoading(true);  // 화면 스켈레톤 노출용 (store)
    setError(null);

    try {
      let rawList: any[] = [];

      // 1) 현재 위치가 있으면 위치 기반 조회
      if (currentLocation) {
        const { data, error: fnError } = await supabase.functions.invoke('spots-nearby', {
          body: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            radiusMeters,
            dogId: activeDog?.dog_id ?? null,
          },
        });
        if (fnError) throw fnError;
        rawList = data?.spots ?? [];
      }

      // 2) 주변 결과가 없거나(비수도권·권한 거부 등) 위치가 없으면 → 추천 스팟 폴백
      //    홈이 절대 비지 않도록 커버리지 중심에서 대표 스팟을 채운다.
      if (rawList.length === 0) {
        const { data: fb, error: fbErr } = await supabase.functions.invoke('spots-nearby', {
          body: {
            latitude: FALLBACK_CENTER.latitude,
            longitude: FALLBACK_CENTER.longitude,
            radiusMeters: FALLBACK_RADIUS_M,
            dogId: activeDog?.dog_id ?? null,
          },
        });
        if (!fbErr && fb?.spots) rawList = (fb.spots as any[]).slice(0, FALLBACK_LIMIT);
      }

      // 더 최신 요청이 진행 중이면(예: 폴백 뒤늦게 도착) 결과 폐기 — 최신 위치 데이터 보존
      if (myReq !== reqIdRef.current) return;

      // SpotCardViewModel (지도/목록 UI용)
      const mapped: SpotCardViewModel[] = rawList.map((s: any) => ({
        spotId: s.spot_id,
        name: s.name,
        category: s.category,
        subcategory: s.subcategory ?? null,
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
        subcategory: s.subcategory ?? undefined,
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

      // 서버가 계산한 커뮤니티 집계 — 화면이 로컬(내 강아지) checkins로 재계산하지 않도록 보관
      const aggregates: Record<string, { checkinCount: number; atmosphereState: any; topFeelingTags: any }> = {};
      for (const sp of rawList) {
        aggregates[sp.spot_id] = {
          checkinCount: sp.checkin_count ?? 0,
          atmosphereState: sp.atmosphere_state ?? 'unknown',
          topFeelingTags: sp.top_feeling_tags ?? [],
        };
      }
      setSpotAggregates(aggregates);

    } catch (err: any) {
      if (myReq === reqIdRef.current) {
        console.error('useNearbySpots error:', err);
        setError('스팟을 불러오지 못했어요');
      }
    } finally {
      // 최신 요청만 로딩 상태를 해제 (stale 응답이 최신 로딩을 조기 종료하지 않도록)
      if (myReq === reqIdRef.current) {
        setIsLoading(false);
        setSpotsLoading(false);
      }
    }
  }, [isAuthenticated, currentLocation, activeDog, radiusMeters, setStoreSpots, setSpotAggregates, setSpotsLoading]);

  // 로그인 완료 시점 + 위치가 의미있게 변할 때 자동 fetch (위치 없어도 폴백 로드)
  useEffect(() => {
    if (!isAuthenticated) {
      // 로그인 전 fetch 금지(401) — 로그인되면 이 effect가 재실행되어 즉시 로드.
      // 기준점도 초기화해 재로그인 시 50m 가드에 막히지 않게 함(로그아웃이 spots를 비우므로).
      prevLocationRef.current = null;
      return;
    }
    const prev = prevLocationRef.current;
    // 위치가 있고 직전 위치 대비 50m 미만 이동이면 재조회 생략
    if (currentLocation && prev) {
      const deltaLat = Math.abs(currentLocation.latitude - prev.lat);
      const deltaLng = Math.abs(currentLocation.longitude - prev.lng);
      if (deltaLat < 0.0005 && deltaLng < 0.0005) return; // ~50m 미만
    }

    if (currentLocation) {
      prevLocationRef.current = { lat: currentLocation.latitude, lng: currentLocation.longitude };
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, isAuthenticated]);

  // pull-to-refresh 버스에 등록 — 화면의 RefreshControl이 refreshAll()로 트리거
  useEffect(() => registerRefreshHandler(refresh), [refresh]);

  return { spots, isLoading, error, refresh };
}
