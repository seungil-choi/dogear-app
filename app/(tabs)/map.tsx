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
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Animated, PanResponder, Linking, Platform, RefreshControl, ActivityIndicator,
} from 'react-native';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import * as Location from 'expo-location';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore, type SpotServerAggregate } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import KakaoMap, { type KakaoMapRef, type KakaoMarker } from '../../src/components/map/KakaoMap';
import { distanceText, categoryLabel as catLabel } from '../../src/utils/labels';
import { FACILITY_CATEGORIES } from '../../src/constants/spotCategories';
import type { SpotCategory, Spot } from '../../src/types';
import { confirm } from '../../src/utils/dialog';
import { toast } from '../../src/utils/toast';
import { track, EVENT } from '../../src/utils/analytics';
import { supabase } from '../../src/lib/supabase';
import { IS_REAL_AUTH } from '../../src/config/env';
// 거리 계산은 geo.ts 한 곳만 쓴다 — 같은 공식을 화면마다 다시 구현하지 않는다
import { haversineDistance as haversineMeters } from '../../src/utils/geo';
import { authoredDescription } from '../../src/utils/spotDescription';


// ─── 초기 중심 (서울 마포구) ─────────────────────────────────
const INITIAL_CENTER = { latitude: 37.5563, longitude: 126.9237, level: 4 };

// ─── 필터 ────────────────────────────────────────────────────
// 'rest' 필터 — 모호하여 Phase 1에서는 비노출 (코드는 유지하되 FILTERS 목록에서 제외)
type FilterKey = 'all' | 'saved' | 'visited' | 'short_walk' | 'long_walk' | 'facility';

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'all',        label: '가까운 곳',   icon: 'map'      },
  // 장소의 74%가 시설(동물병원 5,244 · 애견미용 9,846)인데 걸러낼 방법이 없었다.
  // "가까운 동물병원"은 급할 때 찾는 것이라 검색보다 필터가 빠르다.
  { key: 'facility',   label: '병원·미용',   icon: 'heart'    },
  { key: 'saved',      label: '저장한 곳',   icon: 'bookmark' },
  { key: 'visited',    label: '발도장 남긴', icon: 'paw'      },
  { key: 'short_walk', label: '짧게 걷기',   icon: 'trail'    },
  { key: 'long_walk',  label: '오래 걷기',   icon: 'park'     },
];

const FILTER_CATEGORIES: Partial<Record<FilterKey, readonly SpotCategory[]>> = {
  short_walk: ['trail', 'riverside', 'park'],
  long_walk:  ['park', 'trail'],
  facility:   FACILITY_CATEGORIES,
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
  const spotsTruncated     = useAppStore(s => s.spotsTruncated);
  // getHomeCards가 읽는 상태 — dep 배열과 짝을 맞추기 위해 함께 구독한다
  const spotAggregates     = useAppStore(s => s.spotAggregates);
  const checkins           = useAppStore(s => s.checkins);
  const blockedUsers       = useAppStore(s => s.blockedUsers);

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
  // dep는 getHomeCards가 읽는 상태와 정확히 같게 — 홈 화면과 같은 규칙
  const homeCards = useMemo(
    () => getHomeCards(),
    [getHomeCards, spots, spotAggregates, checkins, visitSummaries, dog, currentLocation, blockedUsers],
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
      case 'long_walk':
      case 'facility': {
        // 카드에 category가 실려 있으므로 spotsById를 되짚을 필요가 없다.
        const cats = FILTER_CATEGORIES[activeFilter] ?? [];
        result = result.filter(c => cats.includes(c.category));
        break;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }

    return result;
  }, [homeCards, activeFilter, searchQuery, isSaved]);

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

  // ── 위치가 잡히면 "지도 화면" 자체를 거기로 옮긴다 (최초 1회) ──
  //   예전에는 계산용 좌표(mapCenter)만 갱신하고 지도 뷰는 기본 좌표(합정)에 머물렀다.
  //   그래서 목록은 내 주변을 기준으로 계산되는데 지도는 엉뚱한 동네를 비추고,
  //   핀도 화면 밖에 있어 "위치 잡혔는데 탐색에 장소가 반영이 안 된다"로 보였다.
  //   한 번 옮긴 뒤에는 사용자가 지도의 주인 — GPS 갱신이 화면을 되돌리지 않는다.
  const mapFollowsLocationRef = useRef(true);
  useEffect(() => {
    if (!currentLocation) return;
    centerSettledRef.current = true;
    if (!mapFollowsLocationRef.current) return;
    mapFollowsLocationRef.current = false;
    setMapCenter({ lat: currentLocation.latitude, lng: currentLocation.longitude });
    programmaticMoveRef.current = true;
    mapRef.current?.setCenter(currentLocation.latitude, currentLocation.longitude, INITIAL_CENTER.level);
  }, [currentLocation]);

  // 이 지역에 등록된 장소가 아예 없는지 — 빈 화면의 원인을 사용자에게 설명하기 위함
  // (현재 데이터 커버리지: 경기 3,467 · 서울 1,847 · 인천 2곳)
  const [regionEmpty, setRegionEmpty] = useState(false);

  // ── 지도 이동 시 해당 지역 스팟 로드 (내 위치 주변만 보이던 문제 해결) ──
  //   중심이 직전 페치 지점에서 충분히 멀어지면(반경의 40%+) 그 지역을 페치해 store에 병합.
  //   700ms 디바운스로 팬 중 연타 방지. 결과는 spot_id 기준 병합이라 기존 핀 유지.
  const lastFetchRef = useRef<{ lat: number; lng: number; radius: number } | null>(null);
  const regionFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dogIdForFetch = useAppStore(s => s.activeDog?.dog_id ?? null);
  /** 새로고침 버튼이 도는 중 — 자동 페치는 조용히 돌지만 이건 사용자가 누른 것이라 보여줘야 한다 */
  const [isRefreshingRegion, setIsRefreshingRegion] = useState(false);

  /**
   * 지금 보고 있는 지역의 장소를 서버에서 받아 store에 병합한다.
   *
   * @param force 이동 거리 임계치를 무시한다. 새로고침 버튼용 —
   *   제자리에서 누르면 `moved === 0`이라 임계치 검사에 걸려 아무 일도 안 일어난다.
   */
  const loadRegionSpots = useCallback(async (force = false) => {
    if (!IS_REAL_AUTH) return;  // 데모 모드는 로컬 시드 사용
    // 서버 상한 10km — 줌아웃해도 중심 기준 10km씩 로드하며 팬으로 누적 탐색
    // 반경을 한 단계 넓게 잡아 주변 팬 시 재페치 없이 핀이 이미 로드돼 있게 함
    const zoomRadius = zoomLevel <= 4 ? 5000 : zoomLevel === 5 ? 6000 : 10000;
    const radius = Math.min(zoomRadius, 10000);
    const last = lastFetchRef.current;
    if (!force && last) {
      const moved = haversineMeters(mapCenter.lat, mapCenter.lng, last.lat, last.lng);
      if (moved < Math.min(radius, last.radius) * 0.4 && radius <= last.radius) return;
    }
    lastFetchRef.current = { lat: mapCenter.lat, lng: mapCenter.lng, radius };
    try {
      const { data } = await supabase.functions.invoke('spots-nearby', {
        body: { latitude: mapCenter.lat, longitude: mapCenter.lng, radiusMeters: radius, dogId: dogIdForFetch },
      });
      const raw: any[] = data?.spots ?? [];
      // 반경 10km 안에 아무것도 없다 = 서비스 데이터 커버리지 밖
      setRegionEmpty(raw.length === 0);
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
          // 지역 페치에서도 빠뜨리면 병합 시 상세와 목록이 어긋난다(subcategory 때와 같은 함정)
          // 설명은 useNearbySpots와 동일하게 authoredDescription으로 거른다 —
          // 서버는 원본을 그대로 내려주므로 여기서 안 거르면 기계 생성문이 스토어에 섞인다.
          description: authoredDescription(sp.description, sp.subcategory),
          features: sp.facility_tags ?? undefined,
          status: 'active' as const,
          created_source: 'seed' as const,
          created_at: new Date().toISOString(),
        }));
      // ⚠️ 타입을 any로 두면 필드를 빠뜨려도 컴파일이 통과한다. 실제로 savedCount가 빠져 있었고,
      //    mergeSpots는 spot_id 단위로 통째 교체(...newAggregates)라 지도를 한 번 움직이면
      //    홈 카드의 저장 수가 0으로 리셋됐다. SpotServerAggregate로 못박아 재발을 막는다.
      const aggs: Record<string, SpotServerAggregate> = {};
      for (const sp of raw) {
        aggs[sp.spot_id] = {
          checkinCount: sp.checkin_count ?? 0,
          atmosphereState: sp.atmosphere_state ?? 'unknown',
          topFeelingTags: sp.top_feeling_tags ?? [],
          savedCount: sp.saved_count ?? 0,
          savedByMe: sp.saved_type != null,
        };
      }
      useAppStore.getState().mergeSpots(merged, aggs);
    } catch (e) {
      // 기존 핀은 유지하되, 실패를 조용히 삼키면 "지도가 안 뜬다"의 원인을 못 찾는다
      // eslint-disable-next-line no-console
      console.error('[map] 지역 스팟 로드 실패:', e);
    }
  }, [mapCenter.lat, mapCenter.lng, zoomLevel, dogIdForFetch]);

  useEffect(() => {
    if (regionFetchTimer.current) clearTimeout(regionFetchTimer.current);
    // 중심이 아직 확정되지 않았으면(위치 수신 대기) 조금 더 기다렸다 쏜다.
    //   곧 위치가 오면 이 타이머는 취소되고 실제 위치로 한 번만 조회된다.
    //   끝내 위치를 못 받아도(권한 거부 등) 기본 중심으로 조회해 지도가 비지 않게 한다.
    //   ⚠️ 여기서 아예 막으면 위치 없는 사용자는 핀을 영영 못 본다(실제로 그렇게 회귀했었다).
    const delay = centerSettledRef.current ? 250 : 1200;
    // 팬 후 반응성(+ 이동 40% 임계치로 과다 조회 방지)
    regionFetchTimer.current = setTimeout(() => { void loadRegionSpots(); }, delay);
    return () => { if (regionFetchTimer.current) clearTimeout(regionFetchTimer.current); };
  }, [loadRegionSpots]);

  /** 새로고침 버튼 — 제자리에서도 이 지역을 다시 읽는다(임계치 무시). */
  const handleRefreshRegion = useCallback(async () => {
    if (isRefreshingRegion) return;
    setIsRefreshingRegion(true);
    try {
      await loadRegionSpots(true);
    } finally {
      setIsRefreshingRegion(false);
    }
  }, [isRefreshingRegion, loadRegionSpots]);

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

  /**
   * 화면에 적을 거리는 **항상 내 위치 기준**이다.
   *
   * 정렬·반경 필터와 기준점이 다른 게 의도다:
   *   - 정렬·필터는 **지도 중심** 기준이어야 한다. 다른 동네로 팬하면 그 동네 장소가 나와야지,
   *     내 위치에서 멀다고 전부 걸러지면 지도를 움직이는 의미가 없다.
   *   - 반면 "거리"는 내가 실제로 가야 하는 거리다. 지도 중심 기준으로 적으면
   *     팬하는 순간 장소 상세와 값이 어긋난다(실제로 어긋나 있었다).
   * 위치를 모르면 지도 중심으로 폴백한다 — 그때는 상세도 '거리 정보 없음'이라 충돌이 없다.
   */
  const distanceFromMe = useCallback((lat: number, lng: number) => {
    const originLat = currentLocation?.latitude ?? mapCenter.lat;
    const originLng = currentLocation?.longitude ?? mapCenter.lng;
    return haversineMeters(originLat, originLng, lat, lng);
  }, [currentLocation, mapCenter.lat, mapCenter.lng]);

  const sortedCards = useMemo(() => {
    return filteredCards
      .map(card => {
        const spot = spotsById.get(card.spot_id);
        if (!spot) return null;
        // 정렬·반경 판정용 — 지도 중심 기준
        const dist = haversineMeters(mapCenter.lat, mapCenter.lng, spot.latitude, spot.longitude);
        if (dist > activeRadiusM) return null;   // 반경 초과 제외
        if (dist < activeMinDistM) return null;  // 최소 거리 미만 제외 (오래 걷기)
        return { card, dist, spot };
      })
      .filter((x): x is { card: typeof filteredCards[0]; dist: number; spot: Spot } => x !== null)
      .sort((a, b) => a.dist - b.dist)
      .map(({ card, spot }) => ({
        ...card,
        // 표시용 — 내 위치 기준(장소 상세와 같은 값이 나와야 한다)
        distance_text: distanceText(distanceFromMe(spot.latitude, spot.longitude)),
      }));
  }, [filteredCards, spotsById, mapCenter.lat, mapCenter.lng, activeRadiusM, activeMinDistM, distanceFromMe]);

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
    return {
      spot_id: sp.spot_id,
      name: sp.name,
      category: sp.category,
      category_label: catLabel[sp.category],
      // subcategory 누락 시 카드가 기본 공원 일러스트로 떨어져 상세 화면과 썸네일이 달라진다
      subcategory: sp.subcategory,
      distance_text: distanceText(distanceFromMe(sp.latitude, sp.longitude)),
      atmosphere_badges: [],
      has_visited: false,
      is_regular: false,
      cover_image_url: sp.cover_image_url,
      // 이 폴백 경로에는 서버 집계가 없다 — 없는 숫자를 지어내지 않고 0으로 둔다
      saved_count: 0,
      server_is_saved: false,
    } as typeof homeCards[0];
  }, [sortedCards, homeCards, spotsById, selectedId, distanceFromMe]);
  const restCards = useMemo(
    () => (selectedId ? sortedCards.filter(c => c.spot_id !== selectedId) : sortedCards),
    [sortedCards, selectedId],
  );

  // ── 클러스터 목록 ──────────────────────────────────────────
  //   클러스터는 탭해도 지도에서 풀리지 않는다(푸는 건 오직 확대).
  //   대신 묶인 장소들을 하단 패널에 그대로 펼쳐 보여준다.
  //   좌표가 완전히 겹쳐 확대해도 안 풀리는 묶음(지구 대표좌표 55곳)도 이 목록으로 도달한다.
  const [clusterIds, setClusterIds] = useState<string[] | null>(null);
  const clusterCards = useMemo(() => {
    if (!clusterIds) return null;
    const idSet = new Set(clusterIds);
    const found = sortedCards.filter(c => idSet.has(c.spot_id));
    // 목록이 비면(반경·필터 변화로 대상이 사라진 경우) 클러스터 모드를 자동 해제한다.
    // "겹친 장소 0곳"이라는 막다른 화면을 만들지 않기 위함.
    return found.length > 0 ? found : null;
  }, [clusterIds, sortedCards]);
  const isClusterMode = clusterCards !== null;

  // 목록은 가상화되지 않은 ScrollView라 반경 내 전부를 그리면 비용이 그대로 늘어난다.
  //   밀집 지역(동탄 기준) 실측: 2km 76곳 · 5km 255곳 · 10km 626곳.
  //   줌아웃 시 수백 개 카드가 팬마다 재렌더되므로, 가까운 순으로 끊어서 보여준다.
  //   지도 핀은 전부 그대로 노출되므로 발견성은 줄지 않는다.
  const LIST_PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE);
  // 반경·필터·검색이 바뀌면 처음부터 다시 (펼쳐둔 클러스터 목록도 맥락을 잃으므로 해제)
  useEffect(() => {
    setVisibleCount(LIST_PAGE);
    setClusterIds(null);
  }, [activeFilter, activeRadiusM, searchQuery]);

  // 반경 밖이라 걸러졌을 뿐, 데이터는 이미 있는 경우 → 가장 가까운 장소까지의 거리.
  //   저밀도 지역에서 기본 반경(1km) 안이 비면 "장소가 없다"로 보이지만
  //   실제로는 2km 앞에 있는 경우가 있다. 그때 빈 지도만 보여주면 막다른 길이 된다.
  //   결과가 있을 때는 계산하지 않는다(팬마다 도는 비용 방지).
  const nearestOutOfRange = useMemo(() => {
    if (sortedCards.length > 0) return null;
    let best: number | null = null;
    for (const c of homeCards) {
      const sp = spotsById.get(c.spot_id);
      if (!sp) continue;
      const d = haversineMeters(mapCenter.lat, mapCenter.lng, sp.latitude, sp.longitude);
      if (best == null || d < best) best = d;
    }
    // 10km를 넘으면 "조금 넓게 보기"로 해결될 거리가 아니다 → 서비스 지역 안내로 넘긴다
    return best != null && best <= 10000 ? best : null;
  }, [sortedCards.length, homeCards, spotsById, mapCenter]);

  // 패널이 실제로 그리는 목록 — 클러스터 모드면 묶인 것만, 아니면 평소대로
  const panelCards = clusterCards ?? (selectedHeroCard ? restCards : sortedCards);
  // 클러스터 모드는 clusterCards가 비면 자동 해제되므로, 빈 화면 판정은 반경 내 결과만 보면 된다.
  const panelEmpty = sortedCards.length === 0;

  const handleClusterPress = useCallback((ids: string[]) => {
    // 클러스터를 열면 개별 선택은 해제 — 지도의 강조(주황 링)와 목록이 1:1로 맞도록
    setSelectedId(null);
    selectSpot(null);
    setClusterIds(ids);
    setVisibleCount(LIST_PAGE);
    if (snapState === 'min' || snapState === 'peek') snapToHeight('half');
    cardListRef.current?.scrollTo({ y: 0, animated: true });
  }, [selectSpot, snapState, snapToHeight]);

  const handlePinPress = useCallback((spotId: string) => {
    setClusterIds(null);
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
    setClusterIds(null);
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
          // 핀은 '내가 다녀왔는가'만 말한다. 유형 구분은 카드·상세가 맡는다.
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
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const c = { latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy ?? undefined };
          setCurrentLocation(c);
          programmaticMoveRef.current = true;
          // mapCenter(목록 계산 기준)도 함께 옮긴다 — GPS가 자동으로 화면을 따라오지
          // 않게 바꾼 뒤로는 여기서 명시적으로 맞춰줘야 지도와 목록이 어긋나지 않는다.
          setMapCenter({ lat: c.latitude, lng: c.longitude });
          mapRef.current?.setCenter(c.latitude, c.longitude, 4);
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
      setMapCenter({ lat: fresh.latitude, lng: fresh.longitude });
      mapRef.current?.setCenter(fresh.latitude, fresh.longitude, 4);
    } catch (e) {
      // fallback: 캐시된 위치라도 사용
      if (currentLocation) {
        setIsTracking(true);
        programmaticMoveRef.current = true;
        setMapCenter({ lat: currentLocation.latitude, lng: currentLocation.longitude });
        mapRef.current?.setCenter(currentLocation.latitude, currentLocation.longitude, 4);
      } else {
        toast.error('현재 위치를 찾지 못했어요. 잠시 후 다시 시도해주세요');
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
                  // 결과 없음은 아래 패널의 빈 상태가 이미 말해준다(§4.7) —
                  // 같은 사실을 모달로 한 번 더 막지 않는다.
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
            onClusterClick={handleClusterPress}
            onMapClick={handleMapClick}
            onRegionChange={(lat, lng, lv) => {
              // 사용자가 직접 움직였으면 중심이 확정된 것으로 본다(위치 권한 거부 상황 포함)
              centerSettledRef.current = true;
              // 지도를 옮기거나 확대하면 펼쳐둔 클러스터 목록은 맥락을 잃는다(지도 쪽도 강조 해제됨)
              setClusterIds(null);
              setMapCenter({ lat, lng });
              if (lv != null) setZoomLevel(lv);
              // 사용자가 직접 지도를 움직이면 현위치 추적 해제 (현위치 버튼 이동은 예외)
              if (programmaticMoveRef.current) {
                programmaticMoveRef.current = false;
              } else {
                // 사용자가 직접 옮겼다 → 이후 GPS가 잡혀도 화면을 되돌리지 않는다
                mapFollowsLocationRef.current = false;
                if (isTracking) setIsTracking(false);
              }
            }}
          />

          {/* 현위치 · 새로고침 — 지도가 보이는 상태(min/peek)에서만 노출.
              패널이 half/full로 올라오면 목록 위에 떠서 겹치므로 숨긴다. */}
          {(snapState === 'min' || snapState === 'peek') && (
            <View style={s.myLocFloating} pointerEvents="box-none">
              <TouchableOpacity
                style={[s.myLocBtn, Shadow.m, isTracking && s.myLocBtnActive]}
                onPress={handleMyLocation}
                activeOpacity={0.8}
                accessibilityLabel="현재 위치"
                accessibilityRole="button"
                disabled={isLocating}
              >
                <Icon
                  name={isTracking ? 'location-filled' : 'location'}
                  size={20}
                  color={isTracking ? Colors.brand.onPrimary : Colors.text.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.myLocBtn, Shadow.m]}
                onPress={handleRefreshRegion}
                activeOpacity={0.8}
                accessibilityLabel="이 지역 다시 불러오기"
                accessibilityRole="button"
                disabled={isRefreshingRegion}
              >
                {isRefreshingRegion
                  ? <ActivityIndicator size="small" color={Colors.text.primary} />
                  : <Icon name="refresh" size={20} color={Colors.text.primary} />}
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
                  {isClusterMode ? '겹친 장소' : isSearching ? '검색 결과' : '주변 장소'}
                </Text>
                <View style={s.panelCountBadge}>
                  <Text style={s.panelCount}>
                    {isClusterMode
                      ? `${panelCards.length}곳`
                      : isSearching
                      ? `${sortedCards.length}곳`
                      : `${activeRadiusM >= 1000 ? `${activeRadiusM/1000}km` : `${activeRadiusM}m`} 내 ${sortedCards.length}곳`}
                  </Text>
                </View>
                {/* 서버 상한에 걸려 잘렸으면 알린다. 이걸 숨기면 사용자는 이게 전부라고 믿는다.
                    (동물병원·미용실이 들어온 뒤 도심에서는 상시로 걸린다) */}
                {spotsTruncated && !isClusterMode && !isSearching && (
                  <Text style={s.panelTruncated} numberOfLines={1}>· 일부만</Text>
                )}
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
                {/* 클러스터 목록을 닫고 주변 장소 전체로 돌아가기 */}
                {isClusterMode && (
                  <TouchableOpacity
                    style={s.panelExpandBtn}
                    onPress={() => setClusterIds(null)}
                    accessibilityLabel="겹친 장소 목록 닫기"
                  >
                    <Icon name="close" size={16} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {panelEmpty ? (
              <View style={s.peekEmpty}>
                <Icon name={isSearching ? 'search' : 'map'} size={28} color={Colors.text.tertiary} />
                <Text style={s.peekEmptyText}>
                  {isSearching
                    ? `'${searchQuery.trim()}' 결과가 없어요`
                    : (activeFilter === 'saved'   ? '저장한 곳이 없어요'
                     : activeFilter === 'visited' ? '발도장 남긴 곳이 없어요'
                     : nearestOutOfRange != null  ? '이 반경 안에는 없어요'
                     : regionEmpty                ? '이 지역엔 아직 등록된 장소가 없어요'
                     : '반경 내 장소가 없어요')}
                </Text>
                <Text style={s.peekEmptySub}>
                  {isSearching
                    ? '다른 키워드로 검색하거나 지도를 옮겨보세요'
                    : (activeFilter === 'saved'
                       ? '마음에 드는 장소를 저장해보세요'
                       : activeFilter === 'visited'
                       ? '산책하면서 발도장을 남겨보세요'
                       : nearestOutOfRange != null
                       // ⚠️ 여기만 지도 중심 기준이다(목록 카드는 내 위치 기준).
                       //    바로 아래 '조금 넓게 보기'가 지도 반경을 넓히는 동작이라,
                       //    내 위치 기준으로 적으면 "1.2km라더니 넓혀도 안 나오네"가 된다.
                       ? `보고 있는 곳에서 가장 가까운 장소가 ${distanceText(nearestOutOfRange)}에 있어요`
                       : regionEmpty
                       ? '아직 이 지역은 등록된 곳이 적어요. 알고 계신 곳을 제안해주시면 채워나갈게요'
                       : '지도를 다른 지역으로 옮겨보세요')}
                </Text>
                {/* 빈 지도 앞에서 막다른 길이 되지 않도록 다음 행동을 준다 */}
                {!isSearching && activeFilter !== 'saved' && activeFilter !== 'visited' && (
                  nearestOutOfRange != null ? (
                    // 데이터는 있는데 반경 밖 → 한 단계 넓게 보기(줌아웃하면 반경도 함께 넓어짐)
                    <TouchableOpacity
                      style={s.emptyActionBtn}
                      onPress={() => {
                        programmaticMoveRef.current = true;
                        mapRef.current?.setCenter(mapCenter.lat, mapCenter.lng, Math.min(14, zoomLevel + 2));
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={s.emptyActionText}>더 넓게 보기</Text>
                    </TouchableOpacity>
                  ) : regionEmpty ? (
                    // 커버리지 밖 → 데이터가 있는 지역으로 안내
                    <TouchableOpacity
                      style={s.emptyActionBtn}
                      onPress={() => {
                        programmaticMoveRef.current = true;
                        setMapCenter({ lat: INITIAL_CENTER.latitude, lng: INITIAL_CENTER.longitude });
                        mapRef.current?.setCenter(INITIAL_CENTER.latitude, INITIAL_CENTER.longitude, INITIAL_CENTER.level);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={s.emptyActionText}>장소가 있는 지역 둘러보기</Text>
                    </TouchableOpacity>
                  ) : null
                )}
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
                {!isClusterMode && selectedHeroCard && (
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

                {/* ── 목록 본문 (클러스터 모드면 묶인 것만, 선택 시 restCards, 그 외 전체) ── */}
                {panelCards.slice(0, visibleCount).map(card => (
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
                {panelCards.length > visibleCount && (
                  <TouchableOpacity
                    style={s.listMoreBtn}
                    onPress={() => setVisibleCount(v => v + LIST_PAGE)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.listMoreText}>
                      {panelCards.length - visibleCount}곳 더 보기
                    </Text>
                  </TouchableOpacity>
                )}
                {/* 리스트 끝 안내 — 반경 내 장소가 적어 생기는 하단 공백을 안내로 전환 */}
                <Text style={s.peekListFooter}>
                  {isClusterMode
                    ? '같은 자리에 겹쳐 있는 장소들이에요'
                    : '지도를 옮기면 주변 장소가 더 표시돼요'}
                </Text>
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
              {/* 빈 상태는 제목 + 다음 행동 두 줄이다(§4.7) */}
              <Text style={s.listEmptyText}>해당하는 장소가 없어요</Text>
              <Text style={s.listEmptySub}>
                {isSearching ? '다른 이름으로 찾아보세요' : '반경을 넓히거나 지도를 옮겨보세요'}
              </Text>
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
  panelTruncated: {
    ...Typography.caption,
    color: Colors.text.tertiary,
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
    gap: Spacing[8],   // 새로고침 · 현위치 두 버튼이 붙어 오탭되지 않도록
  },
  myLocBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface.default,
    alignItems: 'center', justifyContent: 'center',
  },
  myLocBtnActive: { backgroundColor: Colors.brand.primary },

  // ── 하단 카드 목록 (peek sheet) ──
  // peek 높이(200px) 안에서 안내 문구 + 액션 버튼이 잘리지 않아야 한다
  // (패널이 overflow:hidden이라 넘치면 버튼이 아예 안 보인다)
  peekEmpty: {
    alignItems: 'center', gap: Spacing[8],
    paddingVertical: Spacing[24], paddingHorizontal: Spacing[24],
  },
  peekEmptyText: { ...Typography.body.m, color: Colors.text.secondary, fontWeight: '600' },
  peekEmptySub: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2, textAlign: 'center' },
  emptyActionBtn: {
    marginTop: Spacing[12],
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[10],
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
  },
  emptyActionText: { ...Typography.label.m, color: Colors.brand.onPrimary, fontWeight: '700' },
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
  listEmptyText:  { ...Typography.body.m, color: Colors.text.secondary },
  listEmptySub:   { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[4] },

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
