/**
 * 탐색 탭 — react-native-maps (Google Maps) 기반
 *
 * 역할: 지도 기반으로 현재 위치 주변 장소를 직접 탐색하고 비교하는 화면
 * 핵심 질문: "근처에 어떤 장소가 있고, 어디가 지금 맞지?"
 *
 * 구조:
 *   상단: 탐색 타이틀 + 지도/리스트 토글 + 검색 토글
 *   필터: 가까운곳/저장한곳/발도장남긴곳/짧게걷기/오래걷기/쉬기좋은
 *   지도 뷰 또는 리스트 뷰 (동일 맥락 안에서 전환)
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, ScrollView, TextInput, Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import type { SpotCategory } from '../../src/types';

// ─── 초기 리전 (서울 마포구) ─────────────────────────────────
const INITIAL_REGION: Region = {
  latitude: 37.5563,
  longitude: 126.9237,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

const PIN_COLOR = {
  regular: Colors.brand.primary,
  visited: '#7BA08B',
  default: '#9C9B97',
};

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
  const getHomeCards = useAppStore(s => s.getHomeCards);
  const spots        = useAppStore(s => s.spots);
  const isSaved      = useAppStore(s => s.isSaved);
  const selectSpot   = useAppStore(s => s.selectSpot);

  const insets = useSafeAreaInsets();

  const [viewMode,      setViewMode]      = useState<ViewMode>('map');
  const [activeFilter,  setActiveFilter]  = useState<FilterKey>('all');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [sheetOpen,     setSheetOpen]     = useState(false);
  const [isTracking,    setIsTracking]    = useState(false);

  const mapRef = useRef<MapView>(null);
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

  const handlePinPress = useCallback((spotId: string) => {
    setSelectedId(spotId);
    setSheetOpen(true);
    selectSpot(spotId);
    const spot = spots.find(s => s.spot_id === spotId);
    if (spot && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: spot.latitude - 0.003, longitude: spot.longitude,
        latitudeDelta: 0.02, longitudeDelta: 0.02,
      }, 400);
    }
  }, [spots, selectSpot]);

  const handleMyLocation = useCallback(() => {
    const next = !isTracking;
    setIsTracking(next);
    if (next) mapRef.current?.animateToRegion(INITIAL_REGION, 400);
  }, [isTracking]);

  const handleCloseSheet = useCallback(() => {
    setSheetOpen(false);
    setSelectedId(null);
  }, []);

  const handleSearchToggle = useCallback(() => {
    setSearchVisible(v => !v);
    if (searchVisible) setSearchQuery('');
  }, [searchVisible]);

  const selectedCard = homeCards.find(c => c.spot_id === selectedId);
  const selectedSpot = spots.find(s => s.spot_id === selectedId);

  return (
    <SafeAreaView style={s.safe}>

      {/* ── 상단 헤더 ── */}
      <View style={s.topBar}>
        {searchVisible ? (
          <View style={s.searchRow}>
            <Icon name="map" size={16} color={Colors.text.tertiary} />
            <TextInput
              style={s.searchInput}
              placeholder="장소명으로 검색"
              placeholderTextColor={Colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={handleSearchToggle}>
              <Icon name="close" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.titleRow}>
            <Text style={s.topTitle}>탐색</Text>
            <View style={s.topActions}>
              <TouchableOpacity style={s.topBtn} onPress={handleSearchToggle}>
                <Icon name="map" size={20} color={Colors.text.secondary} />
              </TouchableOpacity>
              <View style={s.viewToggle}>
                <TouchableOpacity
                  style={[s.toggleBtn, viewMode === 'map' && s.toggleBtnActive]}
                  onPress={() => setViewMode('map')}
                >
                  <Icon name="map" size={16} color={viewMode === 'map' ? Colors.brand.onPrimary : Colors.text.secondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
                  onPress={() => setViewMode('list')}
                >
                  <Icon name="flag" size={16} color={viewMode === 'list' ? Colors.brand.onPrimary : Colors.text.secondary} />
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

      {/* ── 지도 뷰 ── */}
      {viewMode === 'map' && (
        <View style={s.mapContainer}>
          <MapView
            ref={mapRef}
            style={s.map}
            initialRegion={INITIAL_REGION}
            showsUserLocation={isTracking}
            showsMyLocationButton={false}
            showsCompass={false}
            showsScale={false}
            toolbarEnabled={false}
            onPress={() => { if (sheetOpen) handleCloseSheet(); }}
          >
            {filteredCards.map(card => {
              const spot = spots.find(sp => sp.spot_id === card.spot_id);
              if (!spot) return null;
              const isSelected = selectedId === card.spot_id;
              const pinColor   = card.is_regular ? PIN_COLOR.regular
                : card.has_visited ? PIN_COLOR.visited : PIN_COLOR.default;
              return (
                <Marker
                  key={card.spot_id}
                  coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
                  onPress={() => handlePinPress(card.spot_id)}
                  anchor={{ x: 0.5, y: 1.0 }}
                  tracksViewChanges={isSelected}
                >
                  <View style={pin.wrap}>
                    <View style={[pin.dot, { backgroundColor: pinColor }, isSelected && pin.dotSelected]}>
                      <Icon name={card.is_regular ? 'star' : 'paw'} size={11} color="#FFF" />
                    </View>
                    <Text style={[pin.label, isSelected && pin.labelSelected]} numberOfLines={1}>
                      {card.name}
                    </Text>
                  </View>
                </Marker>
              );
            })}
          </MapView>

          {/* 내 위치 버튼 */}
          <TouchableOpacity
            style={[s.myLocBtn, Shadow.m, isTracking && s.myLocBtnActive]}
            onPress={handleMyLocation}
            activeOpacity={0.8}
          >
            <Icon name="navigate" size={20} color={isTracking ? Colors.brand.onPrimary : Colors.brand.primary} />
          </TouchableOpacity>

          {/* 바텀 시트 (핀 선택 시) */}
          {sheetOpen && selectedCard && selectedSpot ? (
            <View style={[s.sheet, Shadow.l, { paddingBottom: insets.bottom + Spacing[16] }]}>
              <View style={s.sheetHandle} />
              {(selectedCard.is_regular || selectedCard.has_visited) && (
                <View style={s.sheetStatusRow}>
                  <View style={[s.statusChip, selectedCard.is_regular && s.statusChipRegular]}>
                    <Icon
                      name={selectedCard.is_regular ? 'star' : 'paw'} size={11}
                      color={selectedCard.is_regular ? Colors.brand.primary : Colors.text.secondary}
                    />
                    <Text style={[s.statusChipText, selectedCard.is_regular && { color: Colors.brand.primary }]}>
                      {selectedCard.is_regular ? '단골 스팟' : '발도장 남긴 곳'}
                    </Text>
                  </View>
                </View>
              )}
              <ListSpotCard
                name={selectedCard.name}
                categoryLabel={selectedCard.category_label}
                distanceText={selectedCard.distance_text}
                atmosphereSummary={selectedCard.atmosphere_badges.join(' · ')}
                isSaved={isSaved(selectedCard.spot_id)}
                onPress={() => router.push(`/spot/${selectedCard.spot_id}`)}
              />
              <TouchableOpacity
                style={s.sheetDetailBtn}
                onPress={() => router.push(`/spot/${selectedCard.spot_id}`)}
                activeOpacity={0.75}
              >
                <Text style={s.sheetDetailText}>장소 상세 보기</Text>
                <Icon name="forward" size={16} color={Colors.brand.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.miniSheet, Shadow.m, { bottom: insets.bottom + 16 }]}>
              <View style={s.miniHeader}>
                <Text style={s.miniTitle}>주변 장소</Text>
                <View style={s.miniCountBadge}>
                  <Text style={s.miniCount}>{filteredCards.length}곳</Text>
                </View>
              </View>
              {filteredCards.length === 0 ? (
                <Text style={s.miniEmpty}>해당하는 장소가 없어요</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.miniList}>
                  {filteredCards.slice(0, 8).map(card => (
                    <TouchableOpacity
                      key={card.spot_id}
                      style={[s.miniChip, card.is_regular && s.miniChipRegular]}
                      onPress={() => handlePinPress(card.spot_id)}
                      activeOpacity={0.75}
                    >
                      {card.is_regular && <Icon name="star" size={11} color={Colors.brand.primary} />}
                      <Text style={[s.miniChipText, card.is_regular && s.miniChipTextRegular]} numberOfLines={1}>
                        {card.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── 리스트 뷰 ── */}
      {viewMode === 'list' && (
        <ScrollView style={s.listScroll} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          <View style={s.listResultHeader}>
            <Text style={s.listResultText}>{filteredCards.length}개의 장소</Text>
          </View>
          {filteredCards.length === 0 ? (
            <View style={s.listEmpty}>
              <Icon name="map" size={32} color={Colors.text.tertiary} />
              <Text style={s.listEmptyText}>해당하는 장소가 없어요</Text>
            </View>
          ) : (
            filteredCards.map(card => (
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
                onPress={() => router.push(`/spot/${card.spot_id}`)}
              />
            ))
          )}
        </ScrollView>
      )}

    </SafeAreaView>
  );
}

const pin = StyleSheet.create({
  wrap:         { alignItems: 'center', gap: 2 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  dotSelected:  { width: 32, height: 32, borderRadius: 16 },
  label: {
    ...Typography.label.s, fontSize: 11,
    color: Colors.text.primary,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 4, maxWidth: 72, overflow: 'hidden',
  },
  labelSelected: { color: Colors.brand.primary, fontWeight: '700', backgroundColor: '#FFF' },
});

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
  topBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  viewToggle: {
    flexDirection: 'row',
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border.default,
  },
  toggleBtn:       { paddingHorizontal: Spacing[10], paddingVertical: Spacing[6] },
  toggleBtnActive: { backgroundColor: Colors.brand.primary },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: Spacing[12],
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[10],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.round,
    gap: Spacing[8],
    borderWidth: 1, borderColor: Colors.border.default,
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

  mapContainer: { flex: 1 },
  map:          { flex: 1 },

  myLocBtn: {
    position: 'absolute', top: 12, right: Spacing[16],
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface.default,
    alignItems: 'center', justifyContent: 'center',
  },
  myLocBtnActive: { backgroundColor: Colors.brand.primary },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border.default,
    alignSelf: 'center',
    marginTop: Spacing[12], marginBottom: Spacing[8],
  },
  sheetStatusRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[16], paddingBottom: Spacing[6], gap: Spacing[6],
  },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[4],
    paddingHorizontal: Spacing[10], paddingVertical: Spacing[4],
    borderRadius: Radius.round, backgroundColor: Colors.bg.secondary,
  },
  statusChipRegular: { backgroundColor: Colors.brand.subtle },
  statusChipText:    { ...Typography.label.s, color: Colors.text.secondary },
  sheetDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    paddingVertical: Spacing[12],
    marginHorizontal: Spacing[16],
    marginBottom: Spacing[4],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.l,
    borderWidth: 1,
    borderColor: Colors.brand.primaryLight,
  },
  sheetDetailText: { ...Typography.label.m, color: Colors.brand.accent, fontWeight: '600' },

  miniSheet: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.xl, marginHorizontal: Spacing[16], paddingVertical: Spacing[12],
  },
  miniHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    paddingHorizontal: Spacing[16], marginBottom: Spacing[10],
  },
  miniTitle:      { ...Typography.label.l, color: Colors.text.primary },
  miniCountBadge: {
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[8], paddingVertical: 2, borderRadius: Radius.round,
  },
  miniCount:            { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '600' },
  miniEmpty:            { ...Typography.body.s, color: Colors.text.tertiary, paddingHorizontal: Spacing[16], paddingBottom: Spacing[4] },
  miniList:             { paddingHorizontal: Spacing[16], gap: Spacing[8] },
  miniChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[4],
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[12], paddingVertical: Spacing[8],
    borderRadius: Radius.round, borderWidth: 1, borderColor: Colors.border.subtle,
  },
  miniChipRegular:      { backgroundColor: Colors.brand.subtle, borderColor: Colors.brand.primary },
  miniChipText:         { ...Typography.label.s, color: Colors.text.secondary, maxWidth: 80 },
  miniChipTextRegular:  { color: Colors.brand.primary, fontWeight: '600' },

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
