/**
 * 내 장소 탭
 *
 * 역할: 우리 아이와 관계가 생긴 곳과 저장한 곳을 관리/회고
 * 핵심 질문: "우리는 어디를 다녔고, 어디를 다시 가고 싶지?"
 *
 * 구조:
 *   Tab 1. 발도장 남긴 곳 — 방문횟수 + 최근방문일 + 단골 상태 라벨
 *   Tab 2. 저장한 곳      — 가보고 싶은 곳 / 다시 가고 싶은 곳
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { ListSpotCard } from '../../src/components/spot/SpotCard';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Icon } from '../../src/components/common/Icon';
import { relativeTime, categoryLabel as catLabel } from '../../src/utils/labels';
import { computeRegularStatus } from '../../src/utils/rules';

type Tab = 'visited' | 'saved';
type SortKey = 'recent' | 'regular';

const TABS: { key: Tab; label: string }[] = [
  { key: 'visited', label: '발도장 남긴 곳' },
  { key: 'saved',   label: '저장한 곳' },
];

const REGULAR_LABEL: Record<string, string> = {
  regular: '단골 장소',
  almost:  '거의 단골',
  active:  '활발히 방문 중',
  fading:  '관계가 옅어지는 중',
  none:    '',
};

export default function MySpotsScreen() {
  const router  = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('visited');
  const [sortKey,   setSortKey]   = useState<SortKey>('recent');
  const { refreshing, onRefresh } = usePullToRefresh();

  const dog            = useAppStore(s => s.dog);
  const spots          = useAppStore(s => s.spots);
  const visitSummaries = useAppStore(s => s.visitSummaries);
  const savedSpots     = useAppStore(s => s.savedSpots);
  const currentLocation = useAppStore(s => s.currentLocation);
  const isSaved        = useAppStore(s => s.isSaved);
  const getHomeCards   = useAppStore(s => s.getHomeCards);

  // getHomeCards는 안정적 액션 참조라 [getHomeCards]만으로는 마운트 후 재계산 안 됨
  // → 비동기 로드된 spots가 반영 안 돼 저장 장소 거리/배지가 죽음. 실데이터 dep으로 재계산.
  const homeCards = useMemo(
    () => getHomeCards(),
    [getHomeCards, spots, visitSummaries, savedSpots, dog, currentLocation],
  );
  // 성능: 방문/저장 목록에서 spots.find(O(n))를 루프로 돌지 않도록 spot_id → Spot Map 1회 구성
  const spotsById = useMemo(() => new Map(spots.map(s => [s.spot_id, s])), [spots]);

  // ── 발도장 남긴 곳 ────────────────────────────────────────────
  const visitedSpots = useMemo(() => {
    const base = visitSummaries
      .filter(sv => sv.dog_id === dog?.dog_id)
      .map(sv => ({
        ...sv,
        regularStatus: computeRegularStatus(sv),
        spot: spotsById.get(sv.spot_id),
      }))
      .filter(sv => sv.spot);

    if (sortKey === 'recent') {
      return [...base].sort(
        (a, b) => new Date(b.last_visit_at).getTime() - new Date(a.last_visit_at).getTime()
      );
    }
    // 단골 장소 우선
    return [...base].sort((a, b) => {
      const aReg = a.regularStatus !== 'none' ? 1 : 0;
      const bReg = b.regularStatus !== 'none' ? 1 : 0;
      if (bReg !== aReg) return bReg - aReg;
      return b.visit_count - a.visit_count;
    });
  }, [visitSummaries, spots, dog, sortKey]);

  // ── 저장한 곳 ────────────────────────────────────────────────
  const mySavedSpots = useMemo(() =>
    savedSpots
      .filter(sv => sv.dog_id === dog?.dog_id)
      .map(saved => {
        const spot = spotsById.get(saved.spot_id);
        const card = homeCards.find(c => c.spot_id === saved.spot_id);
        return spot ? { saved, spot, card } : null;
      })
      .filter(Boolean) as { saved: typeof savedSpots[0]; spot: typeof spots[0]; card: typeof homeCards[0] | undefined }[],
  [savedSpots, spots, homeCards, dog]);

  const counts: Record<Tab, number> = {
    visited: visitedSpots.length,
    saved:   mySavedSpots.length,
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* 헤더 — 타이틀 제거, 세그먼트 컨트롤만 */}
      <View style={s.header}>
        {/* 세그먼트 컨트롤 */}
        <View style={s.segmentedControl}>
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.segment, active && s.segmentActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>
                  {tab.label}
                </Text>
                {counts[tab.key] > 0 && (
                  <View style={[s.segCount, active && s.segCountActive]}>
                    <Text style={[s.segCountText, active && s.segCountTextActive]}>
                      {counts[tab.key]}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 정렬 바 — 발도장 남긴 곳 탭에서만 */}
      {activeTab === 'visited' && visitedSpots.length > 0 && (
        <View style={s.sortBar}>
          <TouchableOpacity
            style={[s.sortBtn, sortKey === 'recent' && s.sortBtnActive]}
            onPress={() => setSortKey('recent')}
          >
            <Text style={[s.sortBtnText, sortKey === 'recent' && s.sortBtnTextActive]}>최근 방문순</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sortBtn, sortKey === 'regular' && s.sortBtnActive]}
            onPress={() => setSortKey('regular')}
          >
            <Icon name="star" size={12} color={sortKey === 'regular' ? Colors.brand.primary : Colors.text.tertiary} />
            <Text style={[s.sortBtnText, sortKey === 'regular' && s.sortBtnTextActive]}>단골 장소</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
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
        {/* ── 발도장 남긴 곳 ── */}
        {activeTab === 'visited' && (
          visitedSpots.length === 0 ? (
            <EmptyState
              headline="아직 발도장이 없어요"
              description="산책하고 발도장을 찍으면 여기에 하나씩 기록돼요."
              ctaLabel="첫 발도장 찍으러 가기"
              onCta={() => router.push('/paw-checkin')}
            />
          ) : (
            <>
              {visitedSpots.map(sv => {
                if (!sv.spot) return null;
                const regularLabel = REGULAR_LABEL[sv.regularStatus] || undefined;
                return (
                  <ListSpotCard
                    key={sv.summary_id}
                    name={sv.spot.name}
                    categoryLabel={catLabel[sv.spot.category]}
                    subcategory={sv.spot.subcategory}
                    distanceText={`총 ${sv.visit_count}회 방문`}
                    atmosphereSummary={`마지막 방문 ${relativeTime(sv.last_visit_at)}`}
                    relationSummary={regularLabel}
                    isSaved={isSaved(sv.spot_id)}
                    coverImageUrl={sv.spot.cover_image_url}
                    onPress={() => router.push(`/spot/${sv.spot_id}`)}
                  />
                );
              })}
            </>
          )
        )}

        {/* ── 저장한 곳 ── */}
        {activeTab === 'saved' && (
          mySavedSpots.length === 0 ? (
            <EmptyState
              headline="저장한 곳이 없어요"
              description="마음에 드는 곳을 저장해두면 여기에 모여요."
              ctaLabel="지도 보기"
              onCta={() => router.push('/(tabs)/map')}
            />
          ) : (
            <>
              {/* "가보고 싶다" 그룹 */}
              {mySavedSpots.filter(x => x.saved.saved_type === 'want_to_go').length > 0 && (
                <View style={s.savedGroupHead}>
                  <Icon name="bookmark" size={13} color={Colors.text.secondary} />
                  <Text style={s.savedGroupTitle}>가보고 싶은 곳</Text>
                  <Text style={s.savedGroupCount}>
                    {mySavedSpots.filter(x => x.saved.saved_type === 'want_to_go').length}곳
                  </Text>
                </View>
              )}
              {mySavedSpots.filter(x => x.saved.saved_type === 'want_to_go').map(({ saved, spot, card }) => (
                <ListSpotCard
                  key={saved.saved_spot_id}
                  name={spot.name}
                  categoryLabel={catLabel[spot.category]}
                  subcategory={spot.subcategory}
                  distanceText={card?.distance_text ?? '—'}
                  atmosphereSummary={card?.atmosphere_badges.join(' · ')}
                  isSaved={true}
                  coverImageUrl={spot.cover_image_url}
                  onPress={() => router.push(`/spot/${spot.spot_id}`)}
                />
              ))}

              {/* "다시 가고 싶다" 그룹 */}
              {mySavedSpots.filter(x => x.saved.saved_type === 'go_again').length > 0 && (
                <View style={s.savedGroupHead}>
                  <Icon name="star-filled" size={13} color={Colors.brand.primary} />
                  <Text style={s.savedGroupTitle}>다시 가고 싶은 곳</Text>
                  <Text style={s.savedGroupCount}>
                    {mySavedSpots.filter(x => x.saved.saved_type === 'go_again').length}곳
                  </Text>
                </View>
              )}
              {mySavedSpots.filter(x => x.saved.saved_type === 'go_again').map(({ saved, spot, card }) => (
                <ListSpotCard
                  key={saved.saved_spot_id}
                  name={spot.name}
                  categoryLabel={catLabel[spot.category]}
                  subcategory={spot.subcategory}
                  distanceText={card?.distance_text ?? '—'}
                  atmosphereSummary={card?.atmosphere_badges.join(' · ')}
                  relationSummary="다시 가고 싶은 곳"
                  isSaved={true}
                  coverImageUrl={spot.cover_image_url}
                  onPress={() => router.push(`/spot/${spot.spot_id}`)}
                />
              ))}
            </>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  header: {
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[20],
    paddingBottom: Spacing[12],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
    gap: Spacing[14],
  },
  headerTitle: { ...Typography.display.s, color: Colors.text.primary },
  screenTitle: { ...Typography.display.s, color: Colors.text.primary },

  // ── 세그먼트 컨트롤 ──────────────────────────────────────
  //   흰 배경 트랙 + 활성 세그먼트만 브랜드 오렌지로 채운 알약형. 그림자 없음.
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    paddingVertical: Spacing[10],
    paddingHorizontal: Spacing[8],
    borderRadius: Radius.round,
  },
  segmentActive: {
    backgroundColor: Colors.brand.primary,
  },
  segmentText:       { ...Typography.label.m, color: Colors.text.secondary, fontWeight: '500' },
  segmentTextActive: { color: Colors.brand.onPrimary, fontWeight: '700' },
  segCount: {
    minWidth: 17, height: 17, borderRadius: 8.5,
    backgroundColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // 활성 알약 위에 얹히므로 반투명 화이트로 — 오렌지 위에서 숫자가 묻히지 않게
  segCountActive:     { backgroundColor: 'rgba(255,255,255,0.28)' },
  segCountText:       { ...Typography.label.s, color: Colors.text.tertiary },
  segCountTextActive: { color: Colors.brand.onPrimary, fontWeight: '700' },

  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[10],
    gap: Spacing[8],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[14],
    paddingVertical: Spacing[10],
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  sortBtnActive:     { backgroundColor: Colors.surface.selected, borderColor: Colors.border.brand },
  sortBtnText:       { ...Typography.label.s, color: Colors.text.tertiary },
  sortBtnTextActive: { color: Colors.brand.accent, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  // 저장한 곳 그룹 헤더
  savedGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[16],
    paddingBottom: Spacing[8],
    backgroundColor: Colors.bg.primary,
  },
  savedGroupTitle: {
    flex: 1,
    ...Typography.label.m,
    color: Colors.text.secondary,
    fontWeight: '700',
  },
  savedGroupCount: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
});
