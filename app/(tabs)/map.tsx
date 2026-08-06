/**
 * 탐색 탭 — 카카오맵 기반 (네이티브)
 *
 * 역할: 지도 기반으로 현재 위치 주변 장소를 직접 탐색하고 비교하는 화면
 * 구조:
 *   상단: 탐색 타이틀 + 지도/리스트 토글 + 검색 토글
 *   필터: 가까운곳/저장한곳/발도장남긴곳/짧게걷기/오래걷기/쉬기좋은
 *   지도 뷰 또는 리스트 뷰 (동일 맥락 안에서 전환)
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Animated, PanResponder, Linking, Platform, RefreshControl,
} from 'react-native';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import * as Location from 'expo-location';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import KakaoMap, { type KakaoMapRef, type KakaoMarker } from '../../src/components/map/KakaoMap';
import { distanceText, categoryLabel as catLabel } from '../../src/utils/labels';
import type { SpotCategory, Spot } from '../../src/types';
import { notify, confirm } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';
import { supabase } from '../../src/lib/supabase';
import { IS_REAL_AUTH } from '../../src/config/env';

// ─── 거리 계산 (Haversine) ────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 지구 반지름 (m)
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 초기 중심 (서울 마포구) ─────────────────────────────────
const INITIAL_CENTER = { latitude: 37.5563, longitude: 126.9237, level: 4 };

// ─── 필터 ────────────────────────────────────────────────────
// 'rest' 필터 — 모호하여 Phase 1에서는 비노출 (코드는 유지하되 FILTERS 목록에서 제외)
type FilterKey = 'all' | 'saved' | 'visited' | 'short_walk' | 'long_walk';

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'all',        label: '가까운 곳',   icon: 'map'      },
  { key: 'saved',      label: '저장한 곳',   icon: 'bookmark' },
  { key: 'visited',    label: '발도장 남긴', icon: 'paw'      },
  { key: 'short_walk', label: '짧게 걷기',   icon: 'trail'    },
  { key: 'long_walk',  label: '오래 걷기',   icon: 'park'     },
];

const FILTER_CATEGORIES: Partial<Record<FilterKey, SpotCategory[]>> = {
  short_walk: ['trail', 'riverside', 'park'],
  long_walk:  ['park', 'trail'],
};

// 필터별 거리 반경 (m) — 짧게 걷기는 500m, 오래 걷기는 1.5~3km 대역, 그 외 기본 1km
const FILTER_RADIUS: Partial<Record<FilterKey, number>> = {
  short_walk: 500,
  long_walk:  3000,
};
// 필터별 최소 거리 (m) — 오래 걷기는 1.5km 이상 떨어진 곳(왕복 산책 기준)
const FILTER_MIN_DIST: Partial<Record<FilterKey, number>> = {
  long_walk: 1500,
};

type ViewMode = 'map' | 'list';

export default function ExploreScreen() {
  const router       = useRouter();
  const getHomeCards    = useAppStore(s => s.getHomeCards);
  const spots           = useAppStore(s => s.spots);
  const visitSummaries  = useAppStore(s => s.visitSummaries);
  const dog             = useAppStore(s => s.dog);
  const isSaved         = useAppStore(s => s.isSaved);
  const selectSpot      = useAppStore(s => s.selectSpot);
  const currentLocation     = useAppStore(s => s.currentLocation);
  const setCurrentLocation  = useAppStore(s => s.setCurrentLocation);

  // 성능: 루프에서 spots.find(O(n))를 반복하지 않도록 spot_id → Spot Map을 1회 구성 (팬마다 O(스팟²) 제거)
  const spotsById = useMemo(() => new Map(spots.map(s => [s.spot_id, s])), [spots]);

  const insets = useSafeAreaInsets();

  const [viewMode,      setViewMode]      = useState<ViewMode>('map');
  const { refreshing, onRefresh } = usePullToRefresh();
  const [activeFilter,  setActiveFilter]  = useState<FilterKey>('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [isTracking,    setIsTracking]    = useState(false);
  // 현위치 버튼의 프로그래매틱 이동을 사용자 팬과 구분 — 팬이면 추적 자동 해제
  const programmaticMoveRef = useRef(false);
  // 지도 중심 좌표 — 사용자가 지도를 드래그하면 갱신되어 카드 목록 정렬에 사용됨
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: INITIAL_CENTER.latitude,
    lng: INITIAL_CENTER.longitude,
  });
  const [zoomLevel, setZoomLevel] = useState<number>(INITIAL_CENTER.level);

  // 위치 권한 상태 추적 (denied 시 안내 배너 노출)
  // useLocation hook은 root에서 마운트되어 setCurrentLocation 부작용 있음 — 여기선 상태만 조회
  const [locationPermDenied, setLocationPermDenied] = useState(false);
  const [permBannerDismissed, setPermBannerDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          // 웹은 navigator.geolocation 호출 시점에서만 권한 확인 가능 — currentLocation 없으면 denied로 추정
          if (!cancelled) setLocationPermDenied(!currentLocation);
          return;
        }
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!cancelled) setLocationPermDenied(status !== 'granted');
      } catch {
        if (!cancelled) setLocationPermDenied(true);
      }
    })();
    return () => { cancelled = true; };
  }, [currentLocation]);

  const requestLocationPerm = useCallback(async () => {
    // 탐색에서는 권한을 직접 요청하지 않는다(온보딩이 전담) — 시스템 설정으로만 안내
    if (Platform.OS !== 'web') { Linking.openSettings().catch(() => {}); return; }
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCurrentLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
            setLocationPermDenied(false);
          },
          () => setLocationPermDenied(true),
          { timeout: 8000 },
        );
        return;
      }
      {
        // OS가 차단 상태일 가능성 → 설정 안내
        setLocationPermDenied(true);
      }
    } catch {
      setLocationPermDenied(true);
    }
  }, [setCurrentLocation]);

  const mapRef = useRef<KakaoMapRef>(null);
  const cardListRef = useRef<ScrollView>(null);
  const cardOffsetsRef = useRef<Record<string, number>>({});
  // 실데이터 dep으로 memo화 — 지도 팬 중 매 프레임 카드 전량 재빌드 + WebView 마커 재주입 방지.
  const homeCards = useMemo(
    () => getHomeCards(),
    [getHomeCards, spots, visitSummaries, dog, currentLocation],
  );

  // ── 슬라이드 패널 (네이버 지도 스타일) ────────────────────────
  // 패널은 4단 snap:
  //   min(헤더만 노출, 카드 가려짐) / peek(카드 ~2장) / half(중간) / full(헤더 아래까지)
  const SCREEN_H = Dimensions.get('window').height;
  // 지도 컨테이너 실측 높이 — 패널은 이 컨테이너(overflow:hidden) 안에 있으므로
  // FULL 높이가 이를 넘으면 핸들이 위로 잘려나가 다시 내릴 수 없게 된다(실기기 버그).
  const [containerH, setContainerH] = useState(0);
  const PANEL_MIN_H  = 56;    // 핸들 + "주변 장소 N곳" 헤더만 (카드 완전히 가림)
  const PANEL_PEEK_H = 200;   // 카드 ~2장 보이는 높이
  const PANEL_FULL_H = containerH > 0 ? containerH : Math.round(SCREEN_H * 0.6);
  const PANEL_HALF_H = Math.min(Math.round(SCREEN_H * 0.55), PANEL_FULL_H - 96);

  const panelHeight = useRef(new Animated.Value(PANEL_PEEK_H)).current;
  const [snapState, setSnapState] = useState<'min' | 'peek' | 'half' | 'full'>('peek');
  // PanResponder(메모) 내부에서 최신 snap 상태를 읽기 위한 ref (stale closure 방지)
  const snapStateRef = useRef<'min' | 'peek' | 'half' | 'full'>('peek');

  type PanelSnap = 'min' | 'peek' | 'half' | 'full';

  // snap 상태 → 실제 픽셀 높이 매핑
  const snapToHeight = useCallback((snap: PanelSnap) => {
    const h =
      snap === 'min'  ? PANEL_MIN_H  :
      snap === 'peek' ? PANEL_PEEK_H :
      snap === 'half' ? PANEL_HALF_H : PANEL_FULL_H;
    Animated.spring(panelHeight, {
      toValue: h, useNativeDriver: false, friction: 9, tension: 60,
    }).start();
    setSnapState(snap);
    snapStateRef.current = snap;
  }, [PANEL_MIN_H, PANEL_PEEK_H, PANEL_HALF_H, PANEL_FULL_H, panelHeight]);

  // 드래그 시작 시 현재 높이 기준점
  const dragStartH = useRef(PANEL_PEEK_H);
  const panelPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => {
      // 현재 Animated 값 capture
      panelHeight.stopAnimation((value: number) => { dragStartH.current = value; });
    },
    onPanResponderMove: (_, g) => {
      // 위로 드래그 → 높이 증가, 아래 → 감소
      const next = Math.max(PANEL_MIN_H, Math.min(PANEL_FULL_H, dragStartH.current - g.dy));
      panelHeight.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      // 탭(이동 거의 없음) → 토글: 풀이면 접고, 아니면 펼침 — 드래그 없이도 오르내릴 수 있게
      if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) {
        snapToHeight(snapStateRef.current === 'full' ? 'peek' : 'full');
        return;
      }
      panelHeight.stopAnimation((value: number) => {
        // 가장 가까운 snap으로 정렬
        const candidates: Array<[PanelSnap, number]> = [
          ['min',  PANEL_MIN_H],
          ['peek', PANEL_PEEK_H],
          ['half', PANEL_HALF_H],
          ['full', PANEL_FULL_H],
        ];
        const [nearestSnap] = candidates.reduce((best, cur) =>
          Math.abs(cur[1] - value) < Math.abs(best[1] - value) ? cur : best,
        );
        snapToHeight(nearestSnap);
      });
    },
  }), [PANEL_MIN_H, PANEL_PEEK_H, PANEL_HALF_H, PANEL_FULL_H, panelHeight, snapToHeight]);

  // ── 필터 + 검색 ───────────────────────────────────────────
  const filteredCards = useMemo(() => {
    let result = homeCards;

    switch (activeFilter) {
      case 'saved':
        result = result.filter(c => isSaved(c.spot_id));
        break;
      case 'visited':
        result = result.filter(c => c.has_visited);
        break;
      case 'short_walk':
      case 'long_walk': {
        const cats = FILTER_CATEGORIES[activeFilter] ?? [];
        result = result.filter(c => {
          const sp = spotsById.get(c.spot_id);
          return sp && cats.includes(sp.category as SpotCategory);
        });
        break;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }

    return result;
  }, [homeCards, spots, activeFilter, searchQuery, isSaved]);

  // ── 페이지 진입 시 선택 상태 초기화 + 진입 추적 ──
  useEffect(() => {
    setSelectedId(null);
    selectSpot(null);
    track(EVENT.explore_viewed, { screen_name: 'explore' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 지도 중심이 "확정"됐는지 — 위치가 반영됐거나 사용자가 직접 지도를 움직인 시점부터 true.
  //   확정 전(=앱 기본 좌표)에 지역 페치를 쏘면 사용자가 있지도 않은 지역을 불러온 뒤
  //   위치가 잡히면 곧바로 다시 부르게 된다(진입 시 왕복 낭비).
  //   위치를 못 받는 경우는 useNearbySpots의 폴백이 이미 담당하므로 지도가 비지 않는다.
  const centerSettledRef = useRef(false);

  // ── 사용자 현재 위치가 잡히면 지도 중심도 거기로 동기화 (최초 1회) ──
  useEffect(() => {
    if (currentLocation) {
      centerSettledRef.current = true;
      setMapCenter({ lat: currentLocation.latitude, lng: currentLocation.longitude });
    }
  }, [currentLocation]);

  // ── 지도 이동 시 해당 지역 스팟 로드 (내 위치 주변만 보이던 문제 해결) ──
  //   중심이 직전 페치 지점에서 충분히 멀어지면(반경의 40%+) 그 지역을 페치해 store에 병합.
  //   700ms 디바운스로 팬 중 연타 방지. 결과는 spot_id 기준 병합이라 기존 핀 유지.
  const lastFetchRef = useRef<{ lat: number; lng: number; radius: number } | null>(null);
  const regionFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dogIdForFetch = useAppStore(s => s.activeDog?.dog_id ?? null);
  useEffect(() => {
    if (!IS_REAL_AUTH) return;  // 데모 모드는 로컬 시드 사용
    if (regionFetchTimer.current) clearTimeout(regionFetchTimer.current);
    // 중심이 아직 확정되지 않았으면(위치 수신 대기) 조금 더 기다렸다 쏜다.
    //   곧 위치가 오면 이 타이머는 취소되고 실제 위치로 한 번만 조회된다.
    //   끝내 위치를 못 받아도(권한 거부 등) 기본 중심으로 조회해 지도가 비지 않게 한다.
    //   ⚠️ 여기서 아예 막으면 위치 없는 사용자는 핀을 영영 못 본다(실제로 그렇게 회귀했었다).
    const delay = centerSettledRef.current ? 250 : 1200;
    regionFetchTimer.current = setTimeout(async () => {
      // 서버 상한 10km — 줌아웃해도 중심 기준 10km씩 로드하며 팬으로 누적 탐색
      // (zoomBasedRadiusM은 아래에서 선언되므로 여기선 zoomLevel로 직접 계산)
      // 반경을 한 단계 넓게 잡아 주변 팬 시 재페치 없이 핀이 이미 로드돼 있게 함
      const zoomRadius = zoomLevel <= 4 ? 5000 : zoomLevel === 5 ? 6000 : 10000;
      const radius = Math.min(zoomRadius, 10000);
      const last = lastFetchRef.current;
      if (last) {
        const moved = haversineMeters(mapCenter.lat, mapCenter.lng, last.lat, last.lng);
        if (moved < Math.min(radius, last.radius) * 0.4 && radius <= last.radius) return;
      }
      lastFetchRef.current = { lat: mapCenter.lat, lng: mapCenter.lng, radius };
      try {
        const { data } = await supabase.functions.invoke('spots-nearby', {
          body: { latitude: mapCenter.lat, longitude: mapCenter.lng, radiusMeters: radius, dogId: dogIdForFetch },
        });
        const raw: any[] = data?.spots ?? [];
        if (raw.length === 0) return;
        const merged: Spot[] = raw.map((sp: any) => ({
          spot_id: sp.spot_id,
          name: sp.name,
          category: sp.category,
          // subcategory가 빠지면 카드가 기본 공원 일러스트로 떨어져 상세와 썸네일이 어긋난다
          subcategory: sp.subcategory ?? undefined,
          latitude: sp.latitude,
          longitude: sp.longitude,
          address_text: sp.address_text ?? undefined,
          neighborhood: sp.neighborhood ?? undefined,
          cover_image_url: sp.cover_image_url ?? undefined,
          status: 'active' as const,
          created_source: 'seed' as const,
          created_at: new Date().toISOString(),
        }));
        const aggs: Record<string, any> = {};
        for (const sp of raw) {
          aggs[sp.spot_id] = {
            checkinCount: sp.checkin_count ?? 0,
            atmosphereState: sp.atmosphere_state ?? 'unknown',
            topFeelingTags: sp.top_feeling_tags ?? [],
          };
        }
        useAppStore.getState().mergeSpots(merged, aggs);
      } catch (e) {
        // 기존 핀은 유지하되, 실패를 조용히 삼키면 "지도가 안 뜬다"의 원인을 못 찾는다
        // eslint-disable-next-line no-console
        console.error('[map] 지역 스팟 로드 실패:', e);
      }
    }, delay);  // 팬 후 반응성(+ 이동 40% 임계치로 과다 조회 방지)
    return () => { if (regionFetchTimer.current) clearTimeout(regionFetchTimer.current); };
  }, [mapCenter.lat, mapCenter.lng, zoomLevel, dogIdForFetch]);

  // ── 지도 중심 기준으로 카드 정렬 + 거리 재계산 + 반경 제한 ──
  // 검색 중일 때는 반경 제한 우회 (이름으로 찾는 장소는 거리 무관 노출)
  const isSearching = searchQuery.trim().length > 0;

  // 검색 시작 시 패널이 접혀 있으면 자동으로 올림 — 결과/빈 상태("결과가 없어요")가 보이도록
  useEffect(() => {
    if (isSearching && snapState === 'min') snapToHeight('peek');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching]);
  // 줌 레벨에 따른 동적 반경 — 줌아웃 시 더 넓은 영역을 클러스터로 보여줌
  // 카카오 줌: 1=가장 가까움 ~ 14=가장 멀음
  const zoomBasedRadiusM =
    zoomLevel <= 4 ? 1000 :
    zoomLevel === 5 ? 3500 :
    zoomLevel === 6 ? 7000 :
    zoomLevel === 7 ? 15000 :
    30000;
  const activeRadiusM = isSearching
    ? Number.MAX_SAFE_INTEGER  // 검색 시: 반경 제한 없음
    : Math.max(FILTER_RADIUS[activeFilter] ?? 1000, zoomBasedRadiusM);
  // 오래 걷기 등 최소 거리 필터 (검색 시에는 미적용)
  const activeMinDistM = isSearching ? 0 : (FILTER_MIN_DIST[activeFilter] ?? 0);

  const sortedCards = useMemo(() => {
    return filteredCards
      .map(card => {
        const spot = spotsById.get(card.spot_id);
        if (!spot) return null;
        const dist = haversineMeters(mapCenter.lat, mapCenter.lng, spot.latitude, spot.longitude);
        if (dist > activeRadiusM) return null;   // 반경 초과 제외
        if (dist < activeMinDistM) return null;  // 최소 거리 미만 제외 (오래 걷기)
        return { card, dist };
      })
      .filter((x): x is { card: typeof filteredCards[0]; dist: number } => x !== null)
      .sort((a, b) => a.dist - b.dist)
      .map(({ card, dist }) => ({
        ...card,
        distance_text: distanceText(dist),
      }));
  }, [filteredCards, spots, mapCenter, activeRadiusM, activeMinDistM]);

  // 선택된 핀의 카드 = hero 영역에 항상 노출, 나머지는 주변 다른 장소로 분리
  // 선택된 hero 카드 — 3단계 fallback으로 어떤 핀이든 카드 표시 보장
  //  1) sortedCards(반경 내) — 가장 자연스러운 거리 정보 포함
  //  2) homeCards(active 전체) — 반경 밖이지만 active 장소
  //  3) spots(전체) — homeCards 빌드 조건 미충족 장소까지 직접 빌드 (정상 동작 보장)
  const selectedHeroCard = useMemo(() => {
    if (!selectedId) return null;
    const fromSorted = sortedCards.find(c => c.spot_id === selectedId);
    if (fromSorted) return fromSorted;
    const fromHome = homeCards.find(c => c.spot_id === selectedId);
    if (fromHome) return fromHome;
    // 마지막 fallback — spots에서 직접 minimal 카드 빌드
    const sp = spotsById.get(selectedId);
    if (!sp) return null;
    const dist = haversineMeters(mapCenter.lat, mapCenter.lng, sp.latitude, sp.longitude);
    return {
      spot_id: sp.spot_id,
      name: sp.name,
      category_label: catLabel[sp.category],
      // subcategory 누락 시 카드가 기본 공원 일러스트로 떨어져 상세 화면과 썸네일이 달라진다
      subcategory: sp.subcategory,
      distance_text: distanceText(dist),
      atmosphere_badges: [],
      has_visited: false,
      is_regular: false,
      cover_image_url: sp.cover_image_url,
    } as typeof homeCards[0];
  }, [sortedCards, homeCards, spots, selectedId, mapCenter]);
  const restCards = useMemo(
    () => (selectedId ? sortedCards.filter(c => c.spot_id !== selectedId) : sortedCards),
    [sortedCards, selectedId],
  );

  // 목록은 가상화되지 않은 ScrollView라 반경 내 전부를 그리면 비용이 그대로 늘어난다.
  //   밀집 지역(동탄 기준) 실측: 2km 76곳 · 5km 255곳 · 10km 626곳.
  //   줌아웃 시 수백 개 카드가 팬마다 재렌더되므로, 가까운 순으로 끊어서 보여준다.
  //   지도 핀은 전부 그대로 노출되므로 발견성은 줄지 않는다.
  const LIST_PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);
  // 반경·필터·검색이 바뀌면 처음부터 다시
  useEffect(() => { setVisibleCount(LIST_PAGE); }, [activeFilter, activeRadiusM, searchQuery]);

  const handlePinPress = useCallback((spotId: string) => {
    setSelectedId(spotId);
    selectSpot(spotId);
    const spot = spotsById.get(spotId);
    if (spot && mapRef.current) {
      // 카드 목록이 하단에 있으므로 살짝 위로 보정
      mapRef.current.setCenter(spot.latitude - 0.002, spot.longitude, 4);
    }
    // 핀 클릭 = "이 장소를 보고 싶다"는 의도 → 패널을 half 로 펼쳐
    // 선택 장소를 강조 카드로 노출하고 주변 장소는 보조 정보로 함께 보여줌
    if (snapState === 'min' || snapState === 'peek') {
      snapToHeight('half');
    }
    // 카드 목록의 맨 위(선택 hero 영역)로 스크롤 — 선택 장소가 항상 hero로 노출되므로 0
    if (cardListRef.current) {
      cardListRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [spots, selectSpot, snapState, snapToHeight]);

  // 지도 빈 영역 터치 — 선택 해제 + 패널 상태 초기화 (UseFlow 일관성)
  const handleMapClick = useCallback(() => {
    setSelectedId(null);
    selectSpot(null);
    // 핀 클릭으로 펼친 half/full 패널은 peek 상태로 복귀
    if (snapState === 'half' || snapState === 'full') {
      snapToHeight('peek');
    }
    // 카드 목록 스크롤 위로
    if (cardListRef.current) {
      cardListRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [selectSpot, snapState, snapToHeight]);

  // ── 카카오 마커 데이터 ──
  // 항상 목록(sortedCards)과 동일한 소스를 쓴다.
  //   예전에는 반경 내 결과가 0일 때 homeCards(로드된 전체)로 대체했는데,
  //   그러면 지도에는 멀리 있는 핀이 뜨고 목록은 "0곳"이라 서로 어긋났다.
  //   반경 내에 없으면 지도도 비어야 상태가 일치한다(그 경우 안내 문구가 뜬다).
  const kakaoMarkers = useMemo<KakaoMarker[]>(() => {
    return sortedCards
      .map(card => {
        const spot = spotsById.get(card.spot_id);
        if (!spot) return null;
        return {
          id: card.spot_id,
          latitude: spot.latitude,
          longitude: spot.longitude,
          label: card.name,
          variant: card.is_regular ? 'regular' : (card.has_visited ? 'visited' : 'default'),
        } as KakaoMarker;
      })
      .filter(Boolean) as KakaoMarker[];
  }, [sortedCards, spots]);

  const [isLocating, setIsLocating] = useState(false);

  /**
   * 핀(현재 위치) 버튼 핸들러
   *
   * 1. 추적 중이면 → 추적 해제 (토글)
   * 2. 캐시된 위치가 있으면 → 즉시 그 위치로 이동 + 백그라운드로 fresh fetch
   * 3. 없으면 → 권한 요청 + 위치 fetch 후 이동
   *    - 권한 거부 시 안내 알림
   */
  const handleMyLocation = useCallback(async () => {
    // 토글 OFF: 추적 중일 때 다시 탭하면 해제 (버튼 색으로 상태 확인 가능)
    if (isTracking) {
      setIsTracking(false);
      return;
    }
    // 토글 ON: 내 위치로 이동 + 추적 시작
    setIsLocating(true);
    try {
      // 탐색에서는 권한을 직접 요청하지 않음 — 상태만 확인, 미허용 시 시스템 설정으로 안내
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.status !== 'granted') {
        if (await confirm('내 위치를 보려면 설정에서 위치 권한을 허용해 주세요.', {
          title: '위치 권한이 필요해요',
          cancelText: '닫기',
          confirmText: '설정 열기',
        })) {
          Linking.openSettings();
        }
        return;
      }

      // 1) 마지막으로 알려진 위치가 있으면 즉시 이동 (체감 반응성 — 고정밀 fix는 느릴 수 있음)
      let moved = false;
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const c = { latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy ?? undefined };
          setCurrentLocation(c);
          programmaticMoveRef.current = true;
          mapRef.current?.setCenter(c.latitude, c.longitude, 4);
          moved = true;
        }
      } catch { /* 무시 */ }

      // 2) 정밀 위치로 갱신 (Balanced — High는 실내/최초 fix에서 자주 타임아웃)
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const fresh = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy ?? undefined,
      };
      setCurrentLocation(fresh);
      setIsTracking(true);
      programmaticMoveRef.current = true;
      mapRef.current?.setCenter(fresh.latitude, fresh.longitude, 4);
    } catch (e) {
      // fallback: 캐시된 위치라도 사용
      if (currentLocation) {
        setIsTracking(true);
        programmaticMoveRef.current = true;
        mapRef.current?.setCenter(currentLocation.latitude, currentLocation.longitude, 4);
      } else {
        notify('잠시 후 다시 시도해 주세요.', '위치를 가져올 수 없어요');
      }
    } finally {
      setIsLocating(false);
    }
  }, [isTracking, currentLocation, setCurrentLocation]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── 위치 권한 거부 안내 배너 (dismiss 가능) ── */}
      {locationPermDenied && !permBannerDismissed && (
        <View style={s.permBanner}>
          <Icon name="location" size={16} color={Colors.brand.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.permBannerTitle}>위치 권한이 꺼져 있어요</Text>
            <Text style={s.permBannerDesc}>
              현재 위치 주변 추천과 거리 계산이 동작하지 않아요.
            </Text>
          </View>
          <TouchableOpacity
            onPress={requestLocationPerm}
            style={s.permBannerBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="위치 권한 허용"
            accessibilityRole="button"
          >
            <Text style={s.permBannerBtnText}>허용</Text>
          </TouchableOpacity>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              onPress={() => Linking.openSettings().catch(() => {})}
              style={s.permBannerBtnOutline}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="시스템 설정 열기"
              accessibilityRole="button"
            >
              <Text style={s.permBannerBtnOutlineText}>설정</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setPermBannerDismissed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="배너 닫기"
          >
            <Icon name="close" size={14} color={Colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── 상단 헤더 ── */}
      <View style={s.topBar}>
        {/* 검색바 + 지도/목록 토글 — 한 줄 */}
        <View style={s.searchToggleRow}>
          <View style={s.searchRow}>
            <Icon name="search" size={16} color={Colors.text.tertiary} />
            <TextInput
              style={s.searchInput}
              placeholder="장소명으로 검색"
              placeholderTextColor={Colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              accessibilityLabel="장소명 검색"
              onSubmitEditing={() => {
                const q = searchQuery.trim();
                if (q.length > 0) {
                  track(EVENT.search_performed, {
                    screen_name: 'explore',
                    query_length: q.length,
                    result_count: sortedCards.length,
                  });
                  if (sortedCards.length === 0) {
                    notify(`'${q}'에 대한 검색 결과가 없습니다.`, '검색 결과 없음');
                  }
                }
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                accessibilityLabel="검색어 지우기"
                hitSlop={8}
              >
                <Icon name="close" size={16} color={Colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* 지도/목록 토글 — 검색바 옆, 라인 아이콘 */}
          <View style={s.viewToggle}>
            <TouchableOpacity
              style={[s.toggleBtn, viewMode === 'map' && s.toggleBtnActive]}
              onPress={() => {
                if (viewMode !== 'map') {
                  setViewMode('map');
                  track(EVENT.map_viewed, { screen_name: 'explore', source_screen: 'list' });
                }
              }}
              accessibilityLabel="지도 보기"
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'map' }}
            >
              <Icon
                name="map"
                size={18}
                color={viewMode === 'map' ? Colors.brand.onPrimary : Colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
              onPress={() => {
                if (viewMode !== 'list') {
                  setViewMode('list');
                  track(EVENT.list_viewed, { screen_name: 'explore', source_screen: 'map' });
                }
              }}
              accessibilityLabel="목록 보기"
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'list' }}
            >
              <Icon
                name="list"
                size={18}
                color={viewMode === 'list' ? Colors.brand.onPrimary : Colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* 필터 칩 — 한 줄 */}
        <View style={s.filterToggleRow}>
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterList}
            keyboardShouldPersistTaps="handled"
            style={s.filterScroll}
          >
          {FILTERS.map(f => {
            const active = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[s.filterChip, active && s.filterChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`${f.label} 필터`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (activeFilter !== f.key) {
                    setActiveFilter(f.key);
                    track(EVENT.filter_applied, {
                      screen_name: 'explore',
                      filter_key: f.key,
                    });
                  }
                }}
                activeOpacity={0.8}
              >
                <Icon name={f.icon as any} size={13} color={active ? Colors.brand.onPrimary : Colors.text.secondary} />
                <Text style={[s.filterLabel, active && s.filterLabelActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
          </ScrollView>
        </View>
      </View>

      {/* ── 지도 뷰: 풀스크린 지도 + 슬라이드 업 패널 ── */}
      {viewMode === 'map' && (
        <View
          style={s.mapFullContainer}
          onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}
        >
          {/* 지도 풀스크린 */}
          <KakaoMap
            ref={mapRef}
            style={s.mapFull}
            initialLatitude={INITIAL_CENTER.latitude}
            initialLongitude={INITIAL_CENTER.longitude}
            initialLevel={INITIAL_CENTER.level}
            userLocation={isTracking ? currentLocation : null}
            selectedId={selectedId}
            markers={kakaoMarkers}
            onMarkerClick={handlePinPress}
            onMapClick={handleMapClick}
            onRegionChange={(lat, lng, lv) => {
              // 사용자가 직접 움직였으면 중심이 확정된 것으로 본다(위치 권한 거부 상황 포함)
              centerSettledRef.current = true;
              setMapCenter({ lat, lng });
              if (lv != null) setZoomLevel(lv);
              // 사용자가 직접 지도를 움직이면 현위치 추적 해제 (현위치 버튼 이동은 예외)
              if (programmaticMoveRef.current) {
                programmaticMoveRef.current = false;
              } else if (isTracking) {
                setIsTracking(false);
              }
            }}
          />

          {/* 내 위치 버튼 — 지도가 보이는 상태(min/peek)에서만 노출.
              패널이 half/full로 올라오면 목록 위에 떠서 겹치므로 숨긴다. */}
          {(snapState === 'min' || snapState === 'peek') && (
            <View style={s.myLocFloating} pointerEvents="box-none">
              <TouchableOpacity
                style={[s.myLocBtn, Shadow.m, isTracking && s.myLocBtnActive]}
                onPress={handleMyLocation}
                activeOpacity={0.8}
                accessibilityLabel="현재 위치"
                disabled={isLocating}
              >
                <Icon
                  name={isTracking ? 'location-filled' : 'location'}
                  size={20}
                  color={isTracking ? Colors.brand.onPrimary : Colors.text.primary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* 슬라이드 패널 — 핸들 영역으로 드래그 */}
          <Animated.View style={[s.slidePanel, Shadow.l, { height: panelHeight }]}>
            {/* 드래그 핸들 — PanResponder 영역 */}
            <View {...panelPanResponder.panHandlers} style={s.panelHandleArea}>
              <View style={s.panelHandle} />
              <View style={s.panelHeader}>
                {/* 헤더는 항상 동일한 컨텍스트 표기 — 선택 시 hero 카드에 장소명이
                    이미 노출되므로 헤더에 중복 표시하지 않음 */}
                <Text style={s.panelTitle} numberOfLines={1}>
                  {isSearching ? '검색 결과' : '주변 장소'}
                </Text>
                <View style={s.panelCountBadge}>
                  <Text style={s.panelCount}>
                    {isSearching
                      ? `${sortedCards.length}곳`
                      : `${activeRadiusM >= 1000 ? `${activeRadiusM/1000}km` : `${activeRadiusM}m`} 내 ${sortedCards.length}곳`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.panelExpandBtn}
                  onPress={() => {
                    if (snapState === 'min') snapToHeight('peek');
                    else if (snapState === 'full') snapToHeight('peek');
                    else snapToHeight('full');
                  }}
                  accessibilityLabel={snapState === 'full' ? '패널 접기' : '패널 펼치기'}
                >
                  <Icon
                    name={snapState === 'full' ? 'down' : 'up'}
                    size={18}
                    color={Colors.text.tertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {sortedCards.length === 0 ? (
              <View style={s.peekEmpty}>
                <Icon name={isSearching ? 'search' : 'map'} size={28} color={Colors.text.tertiary} />
                <Text style={s.peekEmptyText}>
                  {isSearching
                    ? `'${searchQuery.trim()}' 결과가 없어요`
                    : (activeFilter === 'saved'   ? '저장한 곳이 없어요'
                     : activeFilter === 'visited' ? '발도장 남긴 곳이 없어요'
                     : '반경 내 장소가 없어요')}
                </Text>
                <Text style={s.peekEmptySub}>
                  {isSearching
                    ? '다른 키워드로 검색하거나 지도를 옮겨보세요'
                    : (activeFilter === 'saved'
                       ? '마음에 드는 장소를 저장해보세요'
                       : activeFilter === 'visited'
                       ? '산책하면서 발도장을 남겨보세요'
                       : '지도를 다른 지역으로 옮겨보세요')}
                </Text>
              </View>
            ) : (
              <ScrollView
                ref={cardListRef}
                style={s.peekScroll}
                contentContainerStyle={s.peekScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {/* ── 선택된 핀의 hero 카드 (있으면 항상 최상단) ── */}
                {selectedHeroCard && (
                  <View style={s.heroCardWrap}>
                    <View style={s.heroCard}>
                      <View style={s.heroHeader}>
                        <Icon name="location-filled" size={14} color={Colors.brand.primary} />
                        <Text style={s.heroLabel}>선택한 장소</Text>
                      </View>
                      <Text style={s.heroName} numberOfLines={1}>{selectedHeroCard.name}</Text>
                      <Text style={s.heroMeta} numberOfLines={1}>
                        {selectedHeroCard.category_label} · {selectedHeroCard.distance_text}
                        {selectedHeroCard.atmosphere_badges.length > 0
                          ? ` · ${selectedHeroCard.atmosphere_badges.join(' · ')}` : ''}
                      </Text>
                      <View style={s.heroActions}>
                        <TouchableOpacity
                          style={[s.heroBtn, s.heroBtnPrimary]}
                          onPress={() => router.push(`/spot/${selectedHeroCard.spot_id}`)}
                          activeOpacity={0.85}
                        >
                          <Icon name="forward" size={14} color={Colors.brand.onPrimary} />
                          <Text style={s.heroBtnPrimaryText}>상세 보기</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.heroBtn, s.heroBtnSecondary]}
                          onPress={() => {
                            // selectedHeroCard를 직접 사용 — 반경 밖 폴백 핀은 sortedCards에 없어
                            // find가 undefined가 되면서 무반응이던 버그 수정.
                            useAppStore.getState().setPawSpot(selectedHeroCard as any);
                            router.push('/paw-checkin');
                          }}
                          activeOpacity={0.85}
                        >
                          <Icon name="paw" size={14} color={Colors.brand.primary} />
                          <Text style={s.heroBtnSecondaryText}>발도장 찍기</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {restCards.length > 0 && (
                      <View style={s.restHeader}>
                        <View style={s.restHeaderLine} />
                        <Text style={s.restHeaderText}>주변 다른 장소</Text>
                        <View style={s.restHeaderLine} />
                      </View>
                    )}
                  </View>
                )}

                {/* ── 나머지 장소 (선택 안 된 경우 sortedCards 전체, 선택 시 restCards) ── */}
                {(selectedHeroCard ? restCards : sortedCards).slice(0, visibleCount).map(card => (
                  <View
                    key={card.spot_id}
                    onLayout={(e) => { cardOffsetsRef.current[card.spot_id] = e.nativeEvent.layout.y; }}
                    style={s.peekCardWrap}
                  >
                    <ListSpotCard
                      name={card.name}
                      categoryLabel={card.category_label}
                      subcategory={card.subcategory}
                      distanceText={card.distance_text}
                      atmosphereSummary={card.atmosphere_badges.join(' · ')}
                      relationSummary={
                        card.is_regular ? '단골 장소' :
                        card.has_visited ? '발도장 남긴 곳' : undefined
                      }
                      isSaved={isSaved(card.spot_id)}
                      coverImageUrl={card.cover_image_url}
                      onPress={() => router.push(`/spot/${card.spot_id}`)}
                    />
                  </View>
                ))}
                {/* 더 보기 — 목록을 끊어 그리므로 남은 개수를 알리고 이어서 펼친다 */}
                {(selectedHeroCard ? restCards : sortedCards).length > visibleCount && (
                  <TouchableOpacity
                    style={s.listMoreBtn}
                    onPress={() => setVisibleCount(v => v + LIST_PAGE)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.listMoreText}>
                      {(selectedHeroCard ? restCards : sortedCards).length - visibleCount}곳 더 보기
                    </Text>
                  </TouchableOpacity>
                )}
                {/* 리스트 끝 안내 — 반경 내 장소가 적어 생기는 하단 공백을 안내로 전환 */}
                <Text style={s.peekListFooter}>지도를 옮기면 주변 장소가 더 표시돼요</Text>
                <View style={{ height: insets.bottom + 16 }} />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      )}

      {/* ── 리스트 뷰 ── */}
      {viewMode === 'list' && (
        <ScrollView
          style={s.listScroll}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.brand.primary}
              colors={[Colors.brand.primary]}
            />
          }
        >
          <View style={s.listResultHeader}>
            <Text style={s.listResultText}>{sortedCards.length}개의 장소</Text>
          </View>
          {sortedCards.length === 0 ? (
            <View style={s.listEmpty}>
              <Icon name="map" size={32} color={Colors.text.tertiary} />
              <Text style={s.listEmptyText}>해당하는 장소가 없어요</Text>
            </View>
          ) : (
            sortedCards.slice(0, visibleCount).map(card => (
              <ListSpotCard
                key={card.spot_id}
                name={card.name}
                categoryLabel={card.category_label}
                subcategory={card.subcategory}
                distanceText={card.distance_text}
                atmosphereSummary={card.atmosphere_badges.join(' · ')}
                relationSummary={
                  card.is_regular ? '단골 장소' :
                  card.has_visited ? '발도장 남긴 곳' : undefined
                }
                isSaved={isSaved(card.spot_id)}
                coverImageUrl={card.cover_image_url}
                onPress={() => router.push(`/spot/${card.spot_id}`)}
              />
            ))
          )}
          {sortedCards.length > visibleCount && (
            <TouchableOpacity
              style={s.listMoreBtn}
              onPress={() => setVisibleCount(v => v + LIST_PAGE)}
              activeOpacity={0.8}
            >
              <Text style={s.listMoreText}>{sortedCards.length - visibleCount}곳 더 보기</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  topBar: {
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    paddingBottom: Spacing[8],
  },
  // 검색바 + 지도/목록 토글 한 줄
  searchToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
    paddingHorizontal: Spacing[12],
    paddingTop: Spacing[12],
    paddingBottom: Spacing[8],
  },

  filterToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: Spacing[8],
  },
  filterScroll: { flex: 1 },

  viewToggle: {
    flexDirection: 'row',
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border.default,
    flexShrink: 0,
  },
  toggleBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.brand.primary },

  searchRow: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[10],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    gap: Spacing[8],
    borderWidth: 1.5, borderColor: Colors.brand.primary,
  },
  searchInput: { flex: 1, ...Typography.body.m, color: Colors.text.primary, padding: 0 },

  filterList:       { paddingHorizontal: Spacing[16], gap: Spacing[8], paddingBottom: 2 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing[4], paddingHorizontal: Spacing[12], paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  filterChipActive:  { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },
  filterLabel:       { ...Typography.label.s, color: Colors.text.secondary },
  filterLabelActive: { color: Colors.brand.onPrimary, fontWeight: '600' },

  mapContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  map:          { flex: 1 },

  // 풀스크린 지도 + 슬라이드 업 패널
  mapFullContainer: { flex: 1, position: 'relative', backgroundColor: Colors.bg.primary, overflow: 'hidden' },
  mapFull:          { flex: 1 },

  // 슬라이드 패널 (peek/half/full snap)
  slidePanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    zIndex: 10,
  },
  panelHandleArea: {
    paddingTop: Spacing[8], paddingBottom: Spacing[4],
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
  },
  panelHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border.default,
    alignSelf: 'center', marginBottom: Spacing[8],
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[8],
    paddingHorizontal: Spacing[16], paddingBottom: Spacing[10],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  panelTitle: { ...Typography.label.l, color: Colors.text.primary, fontWeight: '700' },
  panelCountBadge: {
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[10], paddingVertical: 2, borderRadius: Radius.round,
  },
  panelCount: { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '700' },
  panelExpandBtn: {
    marginLeft: 'auto',
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },

  // 내 위치 버튼 — 헤더 + 카테고리 아래 우측 상단 고정
  // (지도 컨테이너의 top:0이 카테고리 바로 아래이므로 24px 띄움)
  myLocFloating: {
    position: 'absolute', top: 24, right: Spacing[16],
    zIndex: 11,
  },
  myLocBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface.default,
    alignItems: 'center', justifyContent: 'center',
  },
  myLocBtnActive: { backgroundColor: Colors.brand.primary },

  // ── 하단 카드 목록 (peek sheet) ──
  peekSheet: {
    flex: 1,
    minHeight: 0, // ScrollView가 부모 안에서 정확한 높이 계산 (flex shrink 허용)
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing[8],
    marginTop: -Spacing[8], // 지도 영역과 살짝 겹쳐 둥근 모서리 강조
    zIndex: 5,
    overflow: 'hidden', // 내부 scrollview의 둥근 모서리 유지
  },
  peekHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border.default,
    alignSelf: 'center',
    marginBottom: Spacing[8],
  },
  peekHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    paddingHorizontal: Spacing[16], paddingBottom: Spacing[10],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  peekTitle: { ...Typography.label.l, color: Colors.text.primary, fontWeight: '700' },
  peekCountBadge: {
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[10], paddingVertical: 2, borderRadius: Radius.round,
  },
  peekCount: { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '700' },
  peekEmpty: {
    alignItems: 'center', gap: Spacing[8], paddingVertical: Spacing[40],
  },
  peekEmptyText: { ...Typography.body.m, color: Colors.text.secondary, fontWeight: '600' },
  peekEmptySub: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2, textAlign: 'center' },
  peekScroll: { flex: 1 },
  peekScrollContent: { paddingTop: Spacing[4] },
  peekListFooter: {
    ...Typography.body.s,
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: Spacing[16],
  },
  listMoreBtn: {
    marginHorizontal: Spacing[16],
    marginTop: Spacing[8],
    paddingVertical: Spacing[12],
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
  },
  listMoreText: {
    ...Typography.body.m,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  peekCardWrap: {
    backgroundColor: Colors.surface.default,
  },
  peekCardWrapSelected: {
    backgroundColor: Colors.brand.subtle,
  },

  // 선택 hero 카드 — 핀 클릭 시 패널 최상단 강조
  heroCardWrap: {
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[12],
    paddingBottom: Spacing[8],
    backgroundColor: Colors.surface.default,
  },
  heroCard: {
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.l,
    padding: Spacing[14],
    borderWidth: 1,
    borderColor: Colors.brand.primary,
    gap: Spacing[6],
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  heroLabel: {
    ...Typography.label.s,
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  heroName: {
    ...Typography.title.m,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  heroMeta: {
    ...Typography.label.s,
    color: Colors.text.secondary,
  },
  heroActions: {
    flexDirection: 'row',
    gap: Spacing[8],
    marginTop: Spacing[8],
  },
  heroBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
    paddingVertical: Spacing[10],
    borderRadius: Radius.m,
  },
  heroBtnPrimary: {
    backgroundColor: Colors.brand.primary,
  },
  heroBtnPrimaryText: {
    ...Typography.label.m,
    color: Colors.brand.onPrimary,
    fontWeight: '700',
  },
  heroBtnSecondary: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.brand.primary,
  },
  heroBtnSecondaryText: {
    ...Typography.label.m,
    color: Colors.brand.primary,
    fontWeight: '700',
  },

  // 주변 다른 장소 — hero 아래 구분선
  restHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
    paddingTop: Spacing[14],
    paddingBottom: Spacing[6],
  },
  restHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border.subtle,
  },
  restHeaderText: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },

  listScroll:       { flex: 1 },
  listContent:      { paddingBottom: 88 },
  listResultHeader: {
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[12],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  listResultText: { ...Typography.label.m, color: Colors.text.secondary },
  listEmpty:      { alignItems: 'center', gap: Spacing[10], paddingVertical: Spacing[48] },
  listEmptyText:  { ...Typography.body.m, color: Colors.text.tertiary },

  // ── 위치 권한 거부 배너 ──
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[10],
    backgroundColor: Colors.brand.subtle,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.brand,
    paddingHorizontal: Spacing[14],
    paddingVertical: Spacing[10],
  },
  permBannerTitle: {
    ...Typography.label.l,
    color: Colors.brand.accent,
    fontWeight: '600',
  },
  permBannerDesc: {
    ...Typography.label.s,
    color: Colors.text.secondary,
  },
  permBannerBtn: {
    paddingHorizontal: Spacing[12],
    paddingVertical: Spacing[6],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.round,
  },
  permBannerBtnText: {
    ...Typography.label.s,
    color: Colors.brand.onPrimary,
    fontWeight: '700',
  },
  permBannerBtnOutline: {
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[6],
    borderWidth: 1,
    borderColor: Colors.border.brand,
    borderRadius: Radius.round,
  },
  permBannerBtnOutlineText: {
    ...Typography.label.s,
    color: Colors.brand.accent,
    fontWeight: '600',
  },
});
