/**
 * 탐색 탭 — 웹 전용 (Leaflet 지도 + 슬라이딩 바텀시트)
 *
 * 구조:
 *   [배경] Leaflet 풀스크린 지도
 *   [상단 오버레이] 검색바 + 필터 칩 (floating)
 *   [하단] 슬라이딩 바텀시트 (2-snap: 반접힘 ↔ 전체)
 */

import React, {
  useState, useMemo, useRef, useEffect, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, Dimensions,
  TouchableOpacity, ScrollView, TextInput,
  Animated, PanResponder, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import type { Spot, SpotCategory } from '../../src/types';

// ─── 타입 ──────────────────────────────────────────────────────────
type FilterKey = 'all' | 'saved' | 'visited' | 'short_walk' | 'long_walk' | 'rest';
type SearchState = 'idle' | 'focused';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',        label: '가까운 곳'   },
  { key: 'saved',      label: '저장한 곳'   },
  { key: 'visited',    label: '발도장 남긴' },
  { key: 'short_walk', label: '짧게 걷기'   },
  { key: 'long_walk',  label: '오래 걷기'   },
  { key: 'rest',       label: '쉬기 좋은'   },
];

const FILTER_CATEGORIES: Partial<Record<FilterKey, SpotCategory[]>> = {
  short_walk: ['trail', 'riverside'],
  long_walk:  ['park', 'trail'],
  rest:       ['rest_spot', 'park'],
};

// ─── 바텀 시트 스냅 상수 ────────────────────────────────────────────
const SHEET_PEEK  = 300;   // 접힌 상태에서 보이는 높이 (px)
const DRAG_THRESH = 50;    // snap 전환 임계값

// 시트 높이는 렌더 시점 윈도우 기준으로 계산
// (웹 리사이즈 대응: 모듈 상수 대신 함수로 처리)
function getSheetFull() {
  return Dimensions.get('window').height;
}

// ─── Leaflet 지도 컴포넌트 (dynamic import) ─────────────────────────
interface LeafletMapProps {
  spots: Spot[];
  filteredSpotIds: Set<string>;
  selectedSpotId: string | null;
  center: [number, number];
  mapRef?: React.MutableRefObject<any>;
  onSpotPress: (spotId: string) => void;
  onMapPress: () => void;
}

function LeafletMap({ spots, filteredSpotIds, selectedSpotId, center, mapRef, onSpotPress, onMapPress }: LeafletMapProps) {
  const [mods, setMods] = useState<{ rl: any; L: any } | null>(null);
  // 마커 클릭과 지도 클릭이 동시에 발생하는 것을 방지하는 플래그
  const markerClickedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([rl, leafletMod]) => {
      const L = leafletMod.default ?? leafletMod;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMods({ rl, L });
    }).catch(console.error);
  }, []);

  if (!mods) {
    return (
      <View style={map.loading}>
        <Text style={map.loadingText}>지도 불러오는 중…</Text>
      </View>
    );
  }

  const { MapContainer, TileLayer, Marker, CircleMarker, useMapEvents } = mods.rl;
  const L = mods.L;

  // ── 발바닥 divIcon 생성 ────────────────────────────────────────────
  // selected=true 이면 라벨 말풍선 + 꼬리 + 발바닥 원을 하나의 마커로 묶음
  // 라벨이 마커 DOM 안에 있으므로 지도 이동 시 함께 움직임
  function makePawIcon(opts: {
    size: number; bg: string; border: string; bw: number;
    label?: string; spotId?: string;
  }) {
    const { size, bg, border, bw, label, spotId } = opts;
    const p = Math.round(size * 0.62);
    const pawSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${p}" height="${p}" viewBox="0 0 32 32" fill="white">
        <ellipse cx="7"  cy="8"  rx="3.8" ry="5"/>
        <ellipse cx="15" cy="5"  rx="3.8" ry="5"/>
        <ellipse cx="23" cy="8"  rx="3.8" ry="5"/>
        <path d="M15.5 14.5c-5.8 0-9.5 3.4-9.5 8.2 0 3.8 3.8 5.8 9.5 5.8s9.5-2 9.5-5.8c0-4.8-3.7-8.2-9.5-8.2z"/>
      </svg>`;
    const pawCircle = `
      <div style="
        width:${size}px;height:${size}px;border-radius:${size / 2}px;
        background:${bg};border:${bw}px solid ${border};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.22);box-sizing:border-box;
      ">${pawSvg}</div>`;

    if (!label || !spotId) {
      return L.divIcon({
        html: pawCircle,
        iconSize:   [size, size],
        iconAnchor: [size / 2, size / 2],
        className:  '',
      });
    }

    // 라벨 포함 — overflow:visible 로 위쪽으로 삐져나옴
    // iconAnchor 는 발바닥 원 중앙에 맞춤
    const arrowSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="${Colors.brand.primary}" stroke-width="2.8"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18l6-6-6-6"/></svg>`;
    const html = `
      <div style="position:relative;width:${size}px;height:${size}px;overflow:visible;cursor:pointer;">
        <!-- 라벨 말풍선 -->
        <div
          onclick="event.stopPropagation();if(window.__dogearNav)window.__dogearNav('${spotId}')"
          style="
            position:absolute;
            bottom:${size + 11}px;
            left:50%;transform:translateX(-50%);
            background:#FFFFFF;
            border:1.5px solid ${Colors.border.brand};
            border-radius:20px;
            padding:6px 13px;
            font-size:13px;font-weight:700;
            color:${Colors.text.primary};
            white-space:nowrap;
            box-shadow:0 3px 10px rgba(0,0,0,0.18);
            display:flex;align-items:center;gap:5px;
            pointer-events:auto;
          "
        >${label}${arrowSvg}</div>
        <!-- 꼬리 삼각형 -->
        <div style="
          position:absolute;
          bottom:${size + 4}px;
          left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-top:7px solid ${Colors.border.brand};
          pointer-events:none;
        "></div>
        <!-- 발바닥 원 -->
        ${pawCircle}
      </div>`;

    return L.divIcon({
      html,
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
      className:  '',
    });
  }

  // 지도 클릭 핸들러 — 마커 클릭 직후에는 무시
  function MapClickHandler() {
    useMapEvents({
      click: () => {
        if (!markerClickedRef.current) onMapPress();
      },
    });
    return null;
  }

  return (
    <MapContainer
      center={center}
      zoom={15}
      zoomControl={false}
      style={{ width: '100%', height: '100%' }}
      ref={(m: any) => { if (mapRef) mapRef.current = m; }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap"
      />
      <MapClickHandler />
      {spots.map(spot => {
        const active   = filteredSpotIds.has(spot.spot_id);
        const selected = selectedSpotId === spot.spot_id;
        const icon = selected
          ? makePawIcon({ size: 36, bg: Colors.brand.primary, border: Colors.border.brand, bw: 2, label: spot.name, spotId: spot.spot_id })
          : active
          ? makePawIcon({ size: 28, bg: Colors.brand.primary, border: '#FFFFFF', bw: 2 })
          : makePawIcon({ size: 22, bg: Colors.border.strong, border: '#FFFFFF', bw: 1.5 });
        return (
          <Marker
            key={spot.spot_id}
            position={[spot.latitude, spot.longitude]}
            icon={icon}
            eventHandlers={{
              click: (e: any) => {
                markerClickedRef.current = true;
                requestAnimationFrame(() => { markerClickedRef.current = false; });
                e.originalEvent?.stopPropagation();
                onSpotPress(spot.spot_id);
              },
            }}
          />
        );
      })}
      {/* 현재 위치 — 파란 점 */}
      <CircleMarker
        center={center}
        radius={8}
        fillColor="#4A90E2"
        color="#FFFFFF"
        weight={3}
        fillOpacity={0.9}
      />
    </MapContainer>
  );
}

// ─── 검색 + 필터 칩 — 모듈 레벨 컴포넌트 ──────────────────────────
// ⚠️ 반드시 컴포넌트 외부에 정의해야 함.
//    내부 정의 시 매 렌더마다 새 컴포넌트가 생성돼 TextInput이 언마운트/리마운트되어
//    키 입력 시마다 포커스를 잃는 버그가 발생한다.
interface SearchAndFiltersProps {
  searchState:    SearchState;
  setSearchState: (s: SearchState) => void;
  searchQuery:    string;
  setSearchQuery: (q: string) => void;
  activeFilter:   FilterKey;
  setActiveFilter:(f: FilterKey) => void;
}

function SearchAndFilters({
  searchState, setSearchState, searchQuery, setSearchQuery,
  activeFilter, setActiveFilter,
}: SearchAndFiltersProps) {
  return (
    <>
      <View style={s.searchBarRow}>
        <TouchableOpacity
          style={[s.searchBar, searchState === 'focused' && s.searchBarFocused]}
          onPress={() => setSearchState('focused')}
          activeOpacity={1}
        >
          <View style={s.searchBarInner}>
            <Icon
              name="search"
              size={16}
              color={searchState === 'focused' ? Colors.brand.primary : Colors.text.tertiary}
            />
            {searchState === 'focused' ? (
              <TextInput
                style={s.searchInput}
                placeholder="장소명으로 검색"
                placeholderTextColor={Colors.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            ) : (
              <Text
                style={[s.searchPlaceholder, !!searchQuery && s.searchPlaceholderFilled]}
                numberOfLines={1}
              >
                {searchQuery || '장소명으로 검색'}
              </Text>
            )}
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={16} color={Colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        {searchState === 'focused' && (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => { setSearchState('idle'); setSearchQuery(''); }}
          >
            <Text style={s.cancelText}>취소</Text>
          </TouchableOpacity>
        )}
      </View>

      {searchState === 'idle' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterList}
        >
          {FILTERS.map(f => {
            const active = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[s.filterChip, active && s.filterChipActive]}
                onPress={() => setActiveFilter(f.key)}
              >
                <Text style={[s.filterLabel, active && s.filterLabelActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

// ─── 메인 화면 ──────────────────────────────────────────────────────
export default function ExploreWebScreen() {
  const router       = useRouter();
  const insets       = useSafeAreaInsets();
  const getHomeCards = useAppStore(s => s.getHomeCards);
  const spots        = useAppStore(s => s.spots);
  const isSaved      = useAppStore(s => s.isSaved);

  const [activeFilter,   setActiveFilter]   = useState<FilterKey>('all');
  const [searchState,    setSearchState]    = useState<SearchState>('idle');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [cssReady,       setCssReady]       = useState(false);
  const [sheetExpanded,  setSheetExpanded]  = useState(false);
  const [locating,       setLocating]       = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // Leaflet 지도 인스턴스 ref (현재위치 이동에 사용)
  const leafletMapRef = useRef<any>(null);

  // ── 장소 상세 이동 (divIcon 내 onclick 에서 호출) ──────────────────
  useEffect(() => {
    (window as any).__dogearNav = (id: string) => router.push(`/spot/${id}` as any);
    return () => { delete (window as any).__dogearNav; };
  }, [router]);

  // ── Leaflet CSS 주입 ────────────────────────────────────────────
  useEffect(() => {
    if (document.querySelector('#leaflet-css')) { setCssReady(true); return; }
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.onload  = () => setCssReady(true);
    link.onerror = () => setCssReady(true); // fail-open
    document.head.appendChild(link);
  }, []);

  // ── 현재 위치 이동 ──────────────────────────────────────────────
  const handleLocateMe = useCallback(() => {
    if (!leafletMapRef.current) return;
    setLocating(true);
    // 실제 앱에서는 expo-location 으로 GPS 좌표를 받아옴
    // 목업: 망원동 중심
    const mockLat = 37.5560;
    const mockLng = 126.9080;
    leafletMapRef.current.flyTo([mockLat, mockLng], 16, { duration: 1.2 });
    setTimeout(() => setLocating(false), 1400);
  }, []);

  // ── 바텀 시트 애니메이션 ────────────────────────────────────────
  // translateY: (sheetFull - SHEET_PEEK) = 접힘, 0 = 완전 펼침
  // sheetFullRef: panResponder 핸들러(useRef 내 클로저)에서도 항상 최신 높이를 읽도록 ref로 관리
  const sheetFullRef     = useRef(getSheetFull());
  sheetFullRef.current   = getSheetFull(); // 매 렌더마다 최신값 동기화
  const sheetFull        = sheetFullRef.current;
  const sheetAnim        = useRef(new Animated.Value(sheetFullRef.current - SHEET_PEEK)).current;
  const sheetExpandedRef = useRef(false);
  const sheetStartY      = useRef(sheetFullRef.current - SHEET_PEEK);

  const snapSheet = useCallback((toExpanded: boolean, vy = 0) => {
    sheetExpandedRef.current = toExpanded;
    setSheetExpanded(toExpanded);
    // 접을 때 검색 상태 초기화 — 포커스된 채로 접으면 float 헤더가 오작동
    if (!toExpanded) {
      setSearchState('idle');
      setSearchQuery('');
    }
    Animated.spring(sheetAnim, {
      toValue:        toExpanded ? 0 : sheetFullRef.current - SHEET_PEEK,
      velocity:       vy,
      tension:        58,
      friction:       13,
      useNativeDriver: false,
    }).start();
  }, [sheetAnim]);

  const panResponder = useRef(
    PanResponder.create({
      // 리스트보기(펼침) 상태에서는 panResponder 비활성 — SearchAndFilters 터치 충돌 방지
      onStartShouldSetPanResponder: () => !sheetExpandedRef.current,
      onMoveShouldSetPanResponder:  (_, gs) => !sheetExpandedRef.current && Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        sheetStartY.current = sheetExpandedRef.current ? 0 : sheetFullRef.current - SHEET_PEEK;
      },
      onPanResponderMove: (_, gs) => {
        const next = Math.max(0, Math.min(sheetFullRef.current - SHEET_PEEK, sheetStartY.current + gs.dy));
        sheetAnim.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -DRAG_THRESH || gs.vy < -0.5) {
          // 위로 → 펼침
          sheetExpandedRef.current = true;
          setSheetExpanded(true);
          Animated.spring(sheetAnim, {
            toValue: 0, velocity: gs.vy, tension: 58, friction: 13, useNativeDriver: false,
          }).start();
        } else if (gs.dy > DRAG_THRESH || gs.vy > 0.5) {
          // 아래로 → 접힘
          sheetExpandedRef.current = false;
          setSheetExpanded(false);
          Animated.spring(sheetAnim, {
            toValue: sheetFullRef.current - SHEET_PEEK, velocity: gs.vy, tension: 58, friction: 13, useNativeDriver: false,
          }).start();
        } else {
          // 임계값 미달 → 원래 위치로 복귀
          Animated.spring(sheetAnim, {
            toValue: sheetExpandedRef.current ? 0 : sheetFullRef.current - SHEET_PEEK,
            tension: 58, friction: 13, useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // ── 필터 ────────────────────────────────────────────────────────
  const homeCards = useMemo(() => getHomeCards(), [getHomeCards]);
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

  // 지도에 표시할 활성 스팟 ID
  const filteredSpotIds = useMemo(
    () => new Set(filteredCards.map(c => c.spot_id)),
    [filteredCards],
  );

  // 지도 중심 (서울 마포구 망원 일대)
  const mapCenter: [number, number] = [37.5560, 126.9080];


  // SearchAndFilters에 전달할 공통 props
  const searchFilterProps: SearchAndFiltersProps = {
    searchState, setSearchState, searchQuery, setSearchQuery,
    activeFilter, setActiveFilter,
  };

  return (
    <View style={s.root}>

      {/* ── 지도 (풀스크린 배경) ── */}
      <View style={StyleSheet.absoluteFill}>
        {cssReady && (
          <LeafletMap
            spots={spots.filter(sp => sp.status === 'active')}
            filteredSpotIds={filteredSpotIds}
            selectedSpotId={selectedSpotId}
            center={mapCenter}
            mapRef={leafletMapRef}
            onSpotPress={(id) => setSelectedSpotId(id)}
            onMapPress={() => setSelectedSpotId(null)}
          />
        )}
      </View>

      {/* ── 상단 플로팅 헤더 — 접힌 상태에서만 표시 ── */}
      {!sheetExpanded && (
        <View style={s.floatingHeader}>
          <SearchAndFilters {...searchFilterProps} />
        </View>
      )}

      {/* ── 현재 위치 버튼 (FAB) — 접힌 상태에서만 표시 ── */}
      {!sheetExpanded && (
        <TouchableOpacity
          style={[s.locateBtn, locating && s.locateBtnActive]}
          onPress={handleLocateMe}
          activeOpacity={0.85}
          accessibilityLabel="현재 위치로 이동"
        >
          <Icon
            name="navigate"
            size={20}
            color={locating ? Colors.brand.onPrimary : Colors.brand.primary}
          />
        </TouchableOpacity>
      )}

      {/* ── 슬라이딩 바텀 시트 ──
          펼침 상태에서는 100vh/translateY 방식 대신 top:0,bottom:0으로 풀스크린.
          (모바일 브라우저 주소창 영역으로 100vh가 viewport 밖으로 밀려 title 행이 잘리는 문제 해결) */}
      <Animated.View
        style={[
          s.sheet,
          sheetExpanded
            ? ({ top: 0, bottom: 0, height: undefined as any, transform: [], borderTopLeftRadius: 0, borderTopRightRadius: 0 } as any)
            : {
                height: sheetFull,
                transform: [{ translateY: sheetAnim }],
                borderTopLeftRadius:  20,
                borderTopRightRadius: 20,
              },
        ]}
      >
        {/* 핸들 + 헤더 — 접힌 상태에서만 드래그 가능 (펼침 상태에서는 SearchAndFilters 터치 보호) */}
        <View
          style={[s.sheetHeader, sheetExpanded && { paddingTop: insets.top > 0 ? insets.top + Spacing[12] : Spacing[16] }]}
          {...(!sheetExpanded ? panResponder.panHandlers : {})}
        >
          {!sheetExpanded && <View style={s.sheetHandle} />}
          <View style={s.sheetTitleRow}>
            <Text style={s.sheetTitle}>내 주변 스팟</Text>
            <View style={s.sheetCountBadge}>
              <Text style={s.sheetCountText}>{filteredCards.length}</Text>
            </View>
            <TouchableOpacity
              style={s.sheetToggleBtn}
              onPress={() => snapSheet(!sheetExpanded)}
            >
              <Icon
                name={sheetExpanded ? 'map' : 'list'}
                size={13}
                color={Colors.text.tertiary}
              />
              <Text style={s.sheetToggleText}>{sheetExpanded ? '지도보기' : '리스트보기'}</Text>
            </TouchableOpacity>
          </View>

          {/* 펼친 상태: 검색 + 필터를 시트 헤더 안에 표시 */}
          {sheetExpanded && (
            <View style={s.sheetSearchArea}>
              <SearchAndFilters {...searchFilterProps} />
            </View>
          )}
        </View>

        {/* 스팟 리스트 */}
        <ScrollView
          style={s.sheetScroll}
          contentContainerStyle={s.sheetScrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={sheetExpanded}
          keyboardShouldPersistTaps="handled"
        >
          {filteredCards.length === 0 ? (
            <View style={s.empty}>
              <Icon name="map" size={32} color={Colors.text.tertiary} />
              <Text style={s.emptyText}>해당하는 장소가 없어요</Text>
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity
                  style={s.emptySuggestBtn}
                  onPress={() => router.push('/suggest-spot?from=map')}
                  activeOpacity={0.8}
                >
                  <Icon name="plus" size={15} color={Colors.brand.onPrimary} />
                  <Text style={s.emptySuggestText}>이 장소 제안하기</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredCards.map(card => (
              <ListSpotCard
                key={card.spot_id}
                name={card.name}
                categoryLabel={card.category_label}
                distanceText={card.distance_text}
                atmosphereSummary={
                  card.atmosphere_badges
                    .filter(b => b !== '단골 스팟' && b !== '자주 찾는 스팟')
                    .join(' · ') || undefined
                }
                relationSummary={
                  card.is_regular ? '단골 스팟' :
                  card.has_visited ? '발도장 남긴 곳' : undefined
                }
                isSaved={isSaved(card.spot_id)}
                coverImageUrl={card.cover_image_url}
                onPress={() => router.push(`/spot/${card.spot_id}`)}
              />
            ))
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Map 내부 스타일 (plain object for Leaflet loading placeholder) ──
const map = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.tertiary,
  },
  loadingText: { ...Typography.body.s, color: Colors.text.tertiary },
});

// ─── 메인 스타일 ────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    // @ts-ignore — RNW: 모바일 브라우저 주소창 변동 대응 (100vh 대신 100dvh)
    height: '100dvh',
    minHeight: '100dvh',
    overflow: 'hidden',
  },

  // ── 상단 플로팅 헤더 — 접힌 상태에서만 렌더 ─────────────────────
  floatingHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    paddingTop: Spacing[16],
    paddingBottom: Spacing[10],
    gap: Spacing[10],
  },

  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    gap: Spacing[10],
  },
  searchBar: {
    flex: 1,
    paddingHorizontal: Spacing[14],
    paddingVertical: Spacing[12],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    justifyContent: 'center',
  },
  searchBarFocused: {
    borderColor: Colors.border.active,
    backgroundColor: Colors.bg.primary,
  },
  searchBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
  },
  searchInput: {
    flex: 1,
    ...Typography.body.m,
    color: Colors.text.primary,
    padding: 0,
    // @ts-ignore — RNW: 브라우저 기본 input outline 제거 (이중 보더 방지)
    outlineStyle: 'none',
    outlineWidth: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  searchPlaceholder: {
    flex: 1,
    ...Typography.body.m,
    color: Colors.text.tertiary,
  },
  searchPlaceholderFilled: { color: Colors.text.primary },

  cancelBtn: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[8] },
  cancelText: { ...Typography.label.m, color: Colors.brand.accent, fontWeight: '600' },

  filterList: {
    paddingHorizontal: Spacing[16],
    gap: Spacing[8],
    paddingBottom: Spacing[2],
  },
  filterChip: {
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[10],
    borderRadius: Radius.round,
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  filterChipActive:  { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },
  filterLabel:       { ...Typography.label.s, color: Colors.text.secondary, fontWeight: '500' },
  filterLabelActive: { color: Colors.brand.onPrimary, fontWeight: '700' },

  // ── 현재 위치 FAB ────────────────────────────────────────────
  locateBtn: {
    position: 'absolute',
    right: Spacing[16],
    bottom: SHEET_PEEK + 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2F2A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    zIndex: 9,
  },
  locateBtnActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },

  // 장소명 라벨은 Leaflet divIcon 안에 인라인 스타일로 렌더링 (지도와 함께 이동)

  // ── 바텀 시트 ────────────────────────────────────────────────────
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#2F2A27',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
  },
  sheetHeader: {
    paddingTop: Spacing[10],
    paddingBottom: Spacing[12],
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing[8],
  },
  sheetHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.strong,
    alignSelf: 'center',
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
  },
  sheetTitle: { ...Typography.title.s, color: Colors.text.primary, fontWeight: '700' },
  sheetCountBadge: {
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  sheetCountText: { ...Typography.label.s, color: Colors.brand.accent, fontWeight: '700' },
  sheetToggleBtn: {
    marginLeft: 'auto' as any,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[6],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  sheetToggleText: { ...Typography.label.s, color: Colors.text.secondary },

  // 펼친 상태: 검색 + 필터 영역 (시트 헤더 내부)
  sheetSearchArea: {
    marginTop: Spacing[10],
    gap: Spacing[10],
  },

  sheetScroll:        { flex: 1 },
  sheetScrollContent: { paddingBottom: 24 },

  // ── 빈 상태 ─────────────────────────────────────────────────────
  empty: {
    alignItems: 'center',
    gap: Spacing[12],
    paddingVertical: Spacing[48],
    paddingHorizontal: Spacing[24],
  },
  emptyText: { ...Typography.body.m, color: Colors.text.tertiary },
  emptySuggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
    marginTop: Spacing[4],
    paddingHorizontal: Spacing[20],
    paddingVertical: Spacing[12],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.round,
  },
  emptySuggestText: { ...Typography.label.m, color: Colors.brand.onPrimary, fontWeight: '700' },
});
