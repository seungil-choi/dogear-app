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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import KakaoMap, { type KakaoMapRef, type KakaoMarker } from '../../src/components/map/KakaoMap';
import { distanceText } from '../../src/utils/labels';
import type { SpotCategory } from '../../src/types';

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
type FilterKey = 'all' | 'saved' | 'visited' | 'short_walk' | 'long_walk' | 'rest';

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'all',        label: '가까운 곳',   icon: 'map'      },
  { key: 'saved',      label: '저장한 곳',   icon: 'bookmark' },
  { key: 'visited',    label: '발도장 남긴', icon: 'paw'      },
  { key: 'short_walk', label: '짧게 걷기',   icon: 'trail'    },
  { key: 'long_walk',  label: '오래 걷기',   icon: 'park'     },
  { key: 'rest',       label: '쉬기 좋은',   icon: 'rest'     },
];

const FILTER_CATEGORIES: Partial<Record<FilterKey, SpotCategory[]>> = {
  short_walk: ['trail', 'riverside'],
  long_walk:  ['park', 'trail'],
  rest:       ['rest_spot', 'park'],
};

type ViewMode = 'map' | 'list';

export default function ExploreScreen() {
  const router       = useRouter();
  const getHomeCards    = useAppStore(s => s.getHomeCards);
  const spots           = useAppStore(s => s.spots);
  const isSaved         = useAppStore(s => s.isSaved);
  const selectSpot      = useAppStore(s => s.selectSpot);
  const currentLocation = useAppStore(s => s.currentLocation);

  const insets = useSafeAreaInsets();

  const [viewMode,      setViewMode]      = useState<ViewMode>('map');
  const [activeFilter,  setActiveFilter]  = useState<FilterKey>('all');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [isTracking,    setIsTracking]    = useState(false);
  // 지도 중심 좌표 — 사용자가 지도를 드래그하면 갱신되어 카드 목록 정렬에 사용됨
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: INITIAL_CENTER.latitude,
    lng: INITIAL_CENTER.longitude,
  });

  const mapRef = useRef<KakaoMapRef>(null);
  const cardListRef = useRef<ScrollView>(null);
  const cardOffsetsRef = useRef<Record<string, number>>({});
  const homeCards = getHomeCards();

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
      case 'rest': {
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

  // ── 카카오 마커 데이터 (컴포넌트 본체에서 메모화 — Hook 규칙) ──
  const kakaoMarkers = useMemo<KakaoMarker[]>(() => {
    return filteredCards
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
  }, [filteredCards, spots]);

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

  // ── 지도 중심 기준으로 카드 정렬 + 거리 재계산 ──
  // 사용자가 지도를 옮기면 mapCenter가 바뀌고, filteredCards가 mapCenter 기준으로 재정렬된다.
  const sortedCards = useMemo(() => {
    return filteredCards
      .map(card => {
        const spot = spots.find(s => s.spot_id === card.spot_id);
        if (!spot) return { card, dist: Number.MAX_SAFE_INTEGER };
        const dist = haversineMeters(mapCenter.lat, mapCenter.lng, spot.latitude, spot.longitude);
        return { card, dist };
      })
      .sort((a, b) => a.dist - b.dist)
      .map(({ card, dist }) => ({
        ...card,
        // 카드 표시용 거리 텍스트를 mapCenter 기준으로 갱신
        distance_text: dist === Number.MAX_SAFE_INTEGER ? card.distance_text : distanceText(dist),
      }));
  }, [filteredCards, spots, mapCenter]);

  const handlePinPress = useCallback((spotId: string) => {
    setSelectedId(spotId);
    selectSpot(spotId);
    const spot = spots.find(s => s.spot_id === spotId);
    if (spot && mapRef.current) {
      // 카드 목록이 하단에 있으므로 살짝 위로 보정
      mapRef.current.setCenter(spot.latitude - 0.002, spot.longitude, 4);
    }
    // 카드 목록에서 해당 카드로 자동 스크롤
    const offset = cardOffsetsRef.current[spotId];
    if (offset != null && cardListRef.current) {
      cardListRef.current.scrollTo({ y: Math.max(0, offset - 8), animated: true });
    }
  }, [spots, selectSpot]);

  const handleMyLocation = useCallback(() => {
    const next = !isTracking;
    setIsTracking(next);
    if (next && currentLocation) {
      mapRef.current?.setCenter(currentLocation.latitude, currentLocation.longitude, 4);
    } else if (next) {
      mapRef.current?.setCenter(INITIAL_CENTER.latitude, INITIAL_CENTER.longitude, INITIAL_CENTER.level);
    }
  }, [isTracking, currentLocation]);

  const handleSearchToggle = useCallback(() => {
    setSearchVisible(v => !v);
    if (searchVisible) setSearchQuery('');
  }, [searchVisible]);

  return (
    <SafeAreaView style={s.safe}>

      {/* ── 상단 헤더 ── */}
      <View style={s.topBar}>
        {searchVisible ? (
          <View style={s.searchRow}>
            <Text style={s.searchLeadIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="장소명으로 검색"
              placeholderTextColor={Colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={handleSearchToggle} accessibilityLabel="검색 닫기">
              <Text style={s.searchCloseIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.titleRow}>
            <Text style={s.topTitle}>탐색</Text>
            <View style={s.topActions}>
              <TouchableOpacity style={s.topBtn} onPress={handleSearchToggle} accessibilityLabel="검색">
                <Text style={s.topBtnEmoji}>🔍</Text>
              </TouchableOpacity>
              <View style={s.viewToggle}>
                <TouchableOpacity
                  style={[s.toggleBtn, viewMode === 'map' && s.toggleBtnActive]}
                  onPress={() => setViewMode('map')}
                  accessibilityLabel="지도 뷰"
                >
                  <Text style={[s.toggleBtnText, viewMode === 'map' && s.toggleBtnTextActive]}>지도</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
                  onPress={() => setViewMode('list')}
                  accessibilityLabel="목록 뷰"
                >
                  <Text style={[s.toggleBtnText, viewMode === 'list' && s.toggleBtnTextActive]}>목록</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterList}
          keyboardShouldPersistTaps="handled"
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

      {/* ── 지도 뷰: 위 지도 + 아래 카드 목록 ── */}
      {viewMode === 'map' && (
        <View style={s.mapSplitContainer}>
          {/* 지도 영역 */}
          <View style={s.mapArea}>
            <KakaoMap
              ref={mapRef}
              style={s.map}
              initialLatitude={INITIAL_CENTER.latitude}
              initialLongitude={INITIAL_CENTER.longitude}
              initialLevel={INITIAL_CENTER.level}
              userLocation={isTracking ? currentLocation : null}
              selectedId={selectedId}
              markers={kakaoMarkers}
              onMarkerClick={handlePinPress}
              onMapClick={() => { setSelectedId(null); }}
              onRegionChange={(lat, lng) => setMapCenter({ lat, lng })}
            />

            {/* 내 위치 버튼 */}
            <TouchableOpacity
              style={[s.myLocBtn, Shadow.m, isTracking && s.myLocBtnActive]}
              onPress={handleMyLocation}
              activeOpacity={0.8}
            >
              <Icon name="navigate" size={20} color={isTracking ? Colors.brand.onPrimary : Colors.brand.primary} />
            </TouchableOpacity>
          </View>

          {/* 하단 카드 목록 (peek sheet) */}
          <View style={[s.peekSheet, Shadow.m]}>
            <View style={s.peekHandle} />
            <View style={s.peekHeader}>
              <Text style={s.peekTitle}>주변 장소</Text>
              <View style={s.peekCountBadge}>
                <Text style={s.peekCount}>{sortedCards.length}곳</Text>
              </View>
            </View>
            {sortedCards.length === 0 ? (
              <View style={s.peekEmpty}>
                <Icon name="map" size={28} color={Colors.text.tertiary} />
                <Text style={s.peekEmptyText}>해당하는 장소가 없어요</Text>
              </View>
            ) : (
              <ScrollView
                ref={cardListRef}
                style={s.peekScroll}
                contentContainerStyle={s.peekScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {sortedCards.map(card => {
                  const isSelected = selectedId === card.spot_id;
                  return (
                    <View
                      key={card.spot_id}
                      onLayout={(e) => { cardOffsetsRef.current[card.spot_id] = e.nativeEvent.layout.y; }}
                      style={[s.peekCardWrap, isSelected && s.peekCardWrapSelected]}
                    >
                      <ListSpotCard
                        name={card.name}
                        categoryLabel={card.category_label}
                        distanceText={card.distance_text}
                        atmosphereSummary={card.atmosphere_badges.join(' · ')}
                        relationSummary={
                          card.is_regular ? '단골 스팟' :
                          card.has_visited ? '발도장 남긴 곳' : undefined
                        }
                        isSaved={isSaved(card.spot_id)}
                        onPress={() => router.push(`/spot/${card.spot_id}` as any)}
                      />
                    </View>
                  );
                })}
                <View style={{ height: insets.bottom + 80 }} />
              </ScrollView>
            )}
          </View>
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
                  card.is_regular ? '단골 스팟' :
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
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[14], paddingBottom: Spacing[8],
  },
  topTitle:   { ...Typography.display.s, color: Colors.text.primary },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[8] },
  topBtn:     {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.round,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  topBtnEmoji: { fontSize: 16 },

  viewToggle: {
    flexDirection: 'row',
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border.default,
  },
  toggleBtn:       { paddingHorizontal: Spacing[12], paddingVertical: Spacing[6] },
  toggleBtnActive: { backgroundColor: Colors.brand.primary },
  toggleBtnText: {
    ...Typography.label.s,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: Colors.brand.onPrimary,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: Spacing[12],
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[10],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    gap: Spacing[8],
    borderWidth: 1.5, borderColor: Colors.brand.primary,
  },
  searchLeadIcon: { fontSize: 14 },
  searchCloseIcon: { fontSize: 14, color: Colors.text.tertiary, paddingHorizontal: 4 },
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

  // 지도 + 카드 목록 split layout
  // RN-Web에서 flex 비율이 잘 안 잡혀 픽셀 + flex 혼합 사용
  mapSplitContainer: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: Colors.bg.primary,
    minHeight: 0,
  },
  mapArea: {
    height: Math.max(280, Math.round(Dimensions.get('window').height * 0.45)),
    position: 'relative',
    overflow: 'hidden',
  },

  myLocBtn: {
    position: 'absolute', top: 12, right: Spacing[16],
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface.default,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
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
  peekEmptyText: { ...Typography.body.m, color: Colors.text.tertiary },
  peekScroll: { flex: 1 },
  peekScrollContent: { paddingTop: Spacing[4] },
  peekCardWrap: {
    backgroundColor: Colors.surface.default,
  },
  peekCardWrapSelected: {
    backgroundColor: Colors.brand.subtle,
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
