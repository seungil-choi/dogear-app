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
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, ScrollView, TextInput, Dimensions,
  Animated, PanResponder, Linking, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import KakaoMap, { type KakaoMapRef, type KakaoMarker } from '../../src/components/map/KakaoMap';
import { distanceText } from '../../src/utils/labels';
import type { SpotCategory } from '../../src/types';
import { notify, confirm } from '../../src/utils/dialog';

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

// 필터별 거리 반경 (m) — 짧게 걷기는 500m, 그 외는 기본 2km
const FILTER_RADIUS: Partial<Record<FilterKey, number>> = {
  short_walk: 500,
  long_walk:  2000,
};

type ViewMode = 'map' | 'list';

export default function ExploreScreen() {
  const router       = useRouter();
  const getHomeCards    = useAppStore(s => s.getHomeCards);
  const spots           = useAppStore(s => s.spots);
  const isSaved         = useAppStore(s => s.isSaved);
  const selectSpot      = useAppStore(s => s.selectSpot);
  const currentLocation     = useAppStore(s => s.currentLocation);
  const setCurrentLocation  = useAppStore(s => s.setCurrentLocation);

  const insets = useSafeAreaInsets();

  const [viewMode,      setViewMode]      = useState<ViewMode>('map');
  const [activeFilter,  setActiveFilter]  = useState<FilterKey>('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [isTracking,    setIsTracking]    = useState(false);
  // 지도 중심 좌표 — 사용자가 지도를 드래그하면 갱신되어 카드 목록 정렬에 사용됨
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: INITIAL_CENTER.latitude,
    lng: INITIAL_CENTER.longitude,
  });
  const [zoomLevel, setZoomLevel] = useState<number>(INITIAL_CENTER.level);

  const mapRef = useRef<KakaoMapRef>(null);
  const cardListRef = useRef<ScrollView>(null);
  const cardOffsetsRef = useRef<Record<string, number>>({});
  const homeCards = getHomeCards();

  // ── 슬라이드 패널 (네이버 지도 스타일) ────────────────────────
  // 패널은 4단 snap:
  //   min(헤더만 노출, 카드 가려짐) / peek(카드 ~2장) / half(중간) / full(헤더 아래까지)
  const SCREEN_H = Dimensions.get('window').height;
  const [headerH, setHeaderH] = useState(160); // 헤더 측정값 (대략 추정 후 onLayout 갱신)
  const PANEL_MIN_H  = 56;    // 핸들 + "주변 장소 N곳" 헤더만 (카드 완전히 가림)
  const PANEL_PEEK_H = 200;   // 카드 ~2장 보이는 높이
  const PANEL_HALF_H = Math.round(SCREEN_H * 0.55);
  const PANEL_FULL_H = Math.max(0, SCREEN_H - headerH - 40);

  const panelHeight = useRef(new Animated.Value(PANEL_PEEK_H)).current;
  const [snapState, setSnapState] = useState<'min' | 'peek' | 'half' | 'full'>('peek');

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
    onPanResponderRelease: () => {
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
          const sp = spots.find(s => s.spot_id === c.spot_id);
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

  // ── 페이지 진입 시 선택 상태 초기화 ──
  useEffect(() => {
    setSelectedId(null);
    selectSpot(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 사용자 현재 위치가 잡히면 지도 중심도 거기로 동기화 (최초 1회) ──
  useEffect(() => {
    if (currentLocation) {
      setMapCenter({ lat: currentLocation.latitude, lng: currentLocation.longitude });
    }
  }, [currentLocation]);

  // ── 지도 중심 기준으로 카드 정렬 + 거리 재계산 + 반경 제한 ──
  // 검색 중일 때는 반경 제한 우회 (이름으로 찾는 장소는 거리 무관 노출)
  const isSearching = searchQuery.trim().length > 0;
  // 줌 레벨에 따른 동적 반경 — 줌아웃 시 더 넓은 영역을 클러스터로 보여줌
  // 카카오 줌: 1=가장 가까움 ~ 14=가장 멀음
  const zoomBasedRadiusM =
    zoomLevel <= 4 ? 2000 :
    zoomLevel === 5 ? 3500 :
    zoomLevel === 6 ? 7000 :
    zoomLevel === 7 ? 15000 :
    30000;
  const activeRadiusM = isSearching
    ? Number.MAX_SAFE_INTEGER  // 검색 시: 반경 제한 없음
    : Math.max(FILTER_RADIUS[activeFilter] ?? 2000, zoomBasedRadiusM);

  const sortedCards = useMemo(() => {
    return filteredCards
      .map(card => {
        const spot = spots.find(s => s.spot_id === card.spot_id);
        if (!spot) return null;
        const dist = haversineMeters(mapCenter.lat, mapCenter.lng, spot.latitude, spot.longitude);
        if (dist > activeRadiusM) return null;   // 반경 초과 제외
        return { card, dist };
      })
      .filter((x): x is { card: typeof filteredCards[0]; dist: number } => x !== null)
      .sort((a, b) => a.dist - b.dist)
      .map(({ card, dist }) => ({
        ...card,
        distance_text: distanceText(dist),
      }));
  }, [filteredCards, spots, mapCenter, activeRadiusM]);

  // 선택된 핀의 카드 = hero 영역에 항상 노출, 나머지는 주변 다른 장소로 분리
  const selectedHeroCard = useMemo(
    () => (selectedId ? sortedCards.find(c => c.spot_id === selectedId) ?? null : null),
    [sortedCards, selectedId],
  );
  const restCards = useMemo(
    () => (selectedId ? sortedCards.filter(c => c.spot_id !== selectedId) : sortedCards),
    [sortedCards, selectedId],
  );

  const handlePinPress = useCallback((spotId: string) => {
    setSelectedId(spotId);
    selectSpot(spotId);
    const spot = spots.find(s => s.spot_id === spotId);
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

  // ── 카카오 마커 데이터 — sortedCards(2km 이내)만 렌더 (성능 및 정확도 보장) ──
  const kakaoMarkers = useMemo<KakaoMarker[]>(() => {
    return sortedCards
      .map(card => {
        const spot = spots.find(sp => sp.spot_id === card.spot_id);
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
    // 추적 해제
    if (isTracking) {
      setIsTracking(false);
      return;
    }

    setIsLocating(true);
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') {
        if (await confirm('내 위치를 보려면 설정에서 위치 권한을 허용해 주세요.', {
          title: '위치 권한이 필요해요',
          cancelText: '닫기',
          confirmText: '설정 열기',
        })) {
          Linking.openSettings();
        }
        return;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Platform.OS === 'web'
          ? Location.Accuracy.Balanced
          : Location.Accuracy.High,
      });
      const fresh = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy ?? undefined,
      };
      setCurrentLocation(fresh);
      setIsTracking(true);
      mapRef.current?.setCenter(fresh.latitude, fresh.longitude, 4);
    } catch (e) {
      // fallback: 캐시된 위치라도 사용
      if (currentLocation) {
        setIsTracking(true);
        mapRef.current?.setCenter(currentLocation.latitude, currentLocation.longitude, 4);
      } else {
        notify('잠시 후 다시 시도해 주세요.', '위치를 가져올 수 없어요');
      }
    } finally {
      setIsLocating(false);
    }
  }, [isTracking, currentLocation, setCurrentLocation]);

  return (
    <SafeAreaView style={s.safe}>

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
              onPress={() => setViewMode('map')}
              accessibilityLabel="지도 뷰"
            >
              <Icon
                name="map"
                size={18}
                color={viewMode === 'map' ? Colors.brand.onPrimary : Colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
              onPress={() => setViewMode('list')}
              accessibilityLabel="목록 뷰"
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
                onPress={() => setActiveFilter(f.key)}
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
        <View style={s.mapFullContainer}>
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
            onMapClick={() => { setSelectedId(null); }}
            onRegionChange={(lat, lng, lv) => {
              setMapCenter({ lat, lng });
              if (lv != null) setZoomLevel(lv);
            }}
          />

          {/* 내 위치 버튼 — 헤더 + 카테고리 아래 우측 상단 고정 */}
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

          {/* 슬라이드 패널 — 핸들 영역으로 드래그 */}
          <Animated.View style={[s.slidePanel, Shadow.l, { height: panelHeight }]}>
            {/* 드래그 핸들 — PanResponder 영역 */}
            <View {...panelPanResponder.panHandlers} style={s.panelHandleArea}>
              <View style={s.panelHandle} />
              <View style={s.panelHeader}>
                {/* 선택된 핀이 있으면 그 장소명을, 없으면 '주변 장소' */}
                <Text style={s.panelTitle} numberOfLines={1}>
                  {selectedHeroCard ? selectedHeroCard.name : (isSearching ? '검색 결과' : '주변 장소')}
                </Text>
                <View style={s.panelCountBadge}>
                  <Text style={s.panelCount}>
                    {selectedHeroCard
                      ? (restCards.length > 0 ? `반경 내 ${restCards.length}곳` : '근처 장소')
                      : isSearching
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
                    : (activeFilter === 'saved'   ? '저장한 장소가 없어요'
                     : activeFilter === 'visited' ? '발도장 남긴 장소가 없어요'
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
                          onPress={() => router.push(`/spot/${selectedHeroCard.spot_id}` as any)}
                          activeOpacity={0.85}
                        >
                          <Icon name="forward" size={14} color={Colors.brand.onPrimary} />
                          <Text style={s.heroBtnPrimaryText}>상세 보기</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.heroBtn, s.heroBtnSecondary]}
                          onPress={() => {
                            const card = sortedCards.find(c => c.spot_id === selectedHeroCard.spot_id);
                            if (card) {
                              useAppStore.getState().setPawSpot(card);
                              router.push('/paw-checkin');
                            }
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
                {(selectedHeroCard ? restCards : sortedCards).map(card => (
                  <View
                    key={card.spot_id}
                    onLayout={(e) => { cardOffsetsRef.current[card.spot_id] = e.nativeEvent.layout.y; }}
                    style={s.peekCardWrap}
                  >
                    <ListSpotCard
                      name={card.name}
                      categoryLabel={card.category_label}
                      distanceText={card.distance_text}
                      atmosphereSummary={card.atmosphere_badges.join(' · ')}
                      relationSummary={
                        card.is_regular ? '단골 장소' :
                        card.has_visited ? '발도장 남긴 곳' : undefined
                      }
                      isSaved={isSaved(card.spot_id)}
                      onPress={() => router.push(`/spot/${card.spot_id}` as any)}
                    />
                  </View>
                ))}
                <View style={{ height: insets.bottom + 80 }} />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      )}

      {/* ── 리스트 뷰 ── */}
      {viewMode === 'list' && (
        <ScrollView style={s.listScroll} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          <View style={s.listResultHeader}>
            <Text style={s.listResultText}>{sortedCards.length}개의 장소</Text>
          </View>
          {sortedCards.length === 0 ? (
            <View style={s.listEmpty}>
              <Icon name="map" size={32} color={Colors.text.tertiary} />
              <Text style={s.listEmptyText}>해당하는 장소가 없어요</Text>
            </View>
          ) : (
            sortedCards.map(card => (
              <ListSpotCard
                key={card.spot_id}
                name={card.name}
                categoryLabel={card.category_label}
                distanceText={card.distance_text}
                atmosphereSummary={card.atmosphere_badges.join(' · ')}
                relationSummary={
                  card.is_regular ? '단골 장소' :
                  card.has_visited ? '발도장 남긴 곳' : undefined
                }
                isSaved={isSaved(card.spot_id)}
                onPress={() => router.push(`/spot/${card.spot_id}` as any)}
              />
            ))
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
});
