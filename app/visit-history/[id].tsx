/**
 * 방문 기록 상세
 *
 * 특정 장소에서 내 강아지의 전체 발도장 기록을 시간순으로 보여준다.
 * 장소 상세 "우리 [강아지]와의 관계 > 자세히 보기"에서 진입.
 *
 * 구조:
 *   - 상단: 장소명 + 방문 요약 (총 N회, 첫 방문일, 마지막 방문일)
 *   - 리스트: 체크인별 날짜 / 느낌 태그 / 메모 / 사진 유무
 */

import React, { useMemo } from 'react';
import { AppImage } from '../../src/components/common/AppImage';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Icon } from '../../src/components/common/Icon';
import { EmptyState } from '../../src/components/common/EmptyState';
import { feelingTagLabel, visitDateText, relativeTime, visibilityLabel } from '../../src/utils/labels';
import type { PawCheckin } from '../../src/types';

// ─── 날짜 그룹 유틸 ────────────────────────────────────────────
function groupByDate(checkins: PawCheckin[]): { date: string; items: PawCheckin[] }[] {
  const map = new Map<string, PawCheckin[]>();
  for (const c of checkins) {
    const key = visitDateText(c.checked_in_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

// ─── 개별 발도장 카드 (타임라인 노드) ───────────────────────────
function CheckinCard({
  checkin,
  isFirst,
  isLast,
  isLatest,
}: {
  checkin: PawCheckin;
  isFirst: boolean;
  isLast: boolean;
  isLatest: boolean;
}) {
  const time = new Date(checkin.checked_in_at);
  const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={r.row}>
      {/* 좌측: dashed line + paw dot */}
      <View style={r.timelineCol}>
        {/* 위 line — 첫 항목엔 없음 */}
        <View style={[r.lineSegment, r.lineTop, isFirst && r.lineHidden]} />

        {/* dot — paw 아이콘 (최근 항목은 채워진 brand bg) */}
        <View style={[r.dotWrap, isLatest && r.dotWrapLatest]}>
          <Icon
            name={isLatest ? 'paw-filled' : 'paw'}
            size={12}
            color={isLatest ? Colors.brand.onPrimary : Colors.brand.primary}
          />
        </View>

        {/* 아래 line — 마지막 항목엔 없음 */}
        <View style={[r.lineSegment, r.lineBottom, isLast && r.lineHidden]} />
      </View>

      {/* 우측: 카드 */}
      <View style={[r.card, isLatest && r.cardLatest]}>
        {/* 카드 헤더 — 시간 + "최근" 배지 */}
        <View style={r.cardHeader}>
          <Text style={r.timeText}>{hhmm}</Text>
          {isLatest && (
            <View style={r.latestChip}>
              <Text style={r.latestChipText}>최근</Text>
            </View>
          )}
        </View>

        {/* 느낌 태그 */}
        {checkin.feeling_tags.length > 0 && (
          <View style={r.tagRow}>
            {checkin.feeling_tags.map(t => (
              <View key={t} style={r.tagChip}>
                <Text style={r.tagText}>{feelingTagLabel[t] ?? t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 메모 */}
        {checkin.note ? (
          <Text style={r.note}>{checkin.note}</Text>
        ) : null}

        {/* 사진 */}
        {checkin.photo_url && (
          <AppImage
            source={{ uri: checkin.photo_url }}
            style={r.photoImage}
            resizeMode="cover"
            accessibilityLabel="발도장 사진"
          />
        )}

        {/* 공개 범위 배지 */}
        <View style={r.visibilityBadge}>
          <Icon
            name={checkin.visibility_level === 'private' ? 'lock' : 'eye'}
            size={11}
            color={Colors.text.tertiary}
          />
          <Text style={r.visibilityText}>
            {visibilityLabel[checkin.visibility_level]}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── 날짜 그룹 chip ────────────────────────────────────────────
function DateHeader({ date }: { date: string }) {
  return (
    <View style={r.dateChip}>
      <Text style={r.dateText}>{date}</Text>
    </View>
  );
}

// ─── 요약 카드 ────────────────────────────────────────────────
function SummaryCard({
  total,
  first,
  last,
}: {
  total: number;
  first: string;
  last: string;
}) {
  return (
    <View style={r.summaryCard}>
      <View style={r.summaryCell}>
        <Text style={r.summaryCellValue}>{total}회</Text>
        <Text style={r.summaryCellLabel}>총 방문</Text>
      </View>
      <View style={r.summaryDivider} />
      <View style={r.summaryCell}>
        <Text style={r.summaryCellValue}>{first}</Text>
        <Text style={r.summaryCellLabel}>첫 방문</Text>
      </View>
      <View style={r.summaryDivider} />
      <View style={r.summaryCell}>
        <Text style={r.summaryCellValue}>{last}</Text>
        <Text style={r.summaryCellLabel}>마지막 방문</Text>
      </View>
    </View>
  );
}

// ─── 메인 스크린 ─────────────────────────────────────────────
export default function VisitHistoryScreen() {
  const { id: spotId } = useLocalSearchParams<{ id: string }>();
  const router         = useRouter();
  const insets         = useSafeAreaInsets();

  const spots    = useAppStore(s => s.spots);
  const checkins = useAppStore(s => s.checkins);
  const dog      = useAppStore(s => s.dog);

  const spot = spots.find(s => s.spot_id === spotId);

  // 이 강아지 × 이 장소의 발도장만, 최신순 정렬
  const myCheckins = useMemo(() => {
    if (!dog) return [];
    return checkins
      .filter(c => c.spot_id === spotId && c.dog_id === dog.dog_id)
      .sort(
        (a, b) =>
          new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime(),
      );
  }, [checkins, spotId, dog]);

  const groups = useMemo(() => groupByDate(myCheckins), [myCheckins]);

  const firstVisit = myCheckins.length > 0
    ? visitDateText(myCheckins[myCheckins.length - 1].checked_in_at)
    : '—';
  const lastVisit = myCheckins.length > 0
    ? relativeTime(myCheckins[0].checked_in_at)
    : '—';

  return (
    <SafeAreaView style={[s.safe, { paddingTop: 0 }]}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <Text style={s.headerName} numberOfLines={1}>
            {spot?.name ?? '장소'}
          </Text>
          <Text style={s.headerSub}>
            {dog?.name ?? '강아지'}의 방문 기록
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {myCheckins.length === 0 ? (
        <EmptyState
          headline="방문 기록이 없어요"
          description="이 장소에서 발도장을 남겨보세요"
        />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* 요약 카드 */}
          <SummaryCard
            total={myCheckins.length}
            first={firstVisit}
            last={lastVisit}
          />

          {/* 타임라인 */}
          {groups.map(({ date, items }, gi) => {
            const isLastGroup = gi === groups.length - 1;
            return (
              <View key={date} style={s.group}>
                <DateHeader date={date} />
                {items.map((c, ii) => {
                  // 전체 발도장 중 가장 최근(첫 item of 첫 group) 1개만 latest 강조
                  const isLatest = gi === 0 && ii === 0;
                  // 첫 행/마지막 행은 위/아래 line 제거 — 자연스러운 종결
                  const isFirst = gi === 0 && ii === 0;
                  const isLast =
                    isLastGroup && ii === items.length - 1;
                  return (
                    <CheckinCard
                      key={c.checkin_id}
                      checkin={c}
                      isFirst={isFirst}
                      isLast={isLast}
                      isLatest={isLatest}
                    />
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── 스타일 ─────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing[20], paddingTop: Spacing[20] },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingBottom: Spacing[12],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing[8],
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, alignItems: 'center' },
  headerName: { ...Typography.title.s, color: Colors.text.primary },
  headerSub:  { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2 },

  group: { marginBottom: Spacing[24] },
});

// 요약 카드 스타일
const r = StyleSheet.create({
  // 요약 카드
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    marginBottom: Spacing[24],
  },
  summaryCell: {
    flex: 1, alignItems: 'center',
    paddingVertical: Spacing[16],
    gap: Spacing[4],
  },
  summaryCellValue: { ...Typography.title.s, color: Colors.text.primary },
  summaryCellLabel: { ...Typography.caption, color: Colors.text.tertiary },
  summaryDivider: {
    width: 1,
    marginVertical: Spacing[12],
    backgroundColor: Colors.border.subtle,
  },

  // ── 날짜 그룹 chip ──
  dateChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[12],
    paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.subtle,
    marginBottom: Spacing[12],
    marginLeft: Spacing[4],
  },
  dateText: {
    ...Typography.label.s,
    color: Colors.brand.accent,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── 행 컨테이너 (timeline + card) ──
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  // ── 좌측 timeline column ──
  timelineCol: {
    width: 36,
    alignItems: 'center',
  },
  // dot wrapper — paw 아이콘이 안에 들어감
  dotWrap: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5,
    borderColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // 라인과 dot 사이 가벼운 분리
    marginVertical: 2,
    zIndex: 1,
  },
  dotWrapLatest: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
    // halo 효과 — 살짝 큰 그림자 같은 느낌으로 두께만
    borderWidth: 2,
    transform: [{ scale: 1.08 }],
  },

  // dashed 연결선 (위/아래 세그먼트)
  lineSegment: {
    width: 0,
    borderLeftWidth: 1.5,
    borderLeftColor: Colors.border.default,
    borderStyle: 'dashed',
  },
  lineTop: {
    height: 14,
  },
  lineBottom: {
    flex: 1,
    minHeight: 24,
  },
  lineHidden: {
    opacity: 0,
  },

  // ── 우측 카드 ──
  card: {
    flex: 1,
    marginLeft: Spacing[12],
    marginBottom: Spacing[14],
    padding: Spacing[14],
    borderRadius: Radius.m,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
    gap: Spacing[8],
  },
  cardLatest: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.subtle,
    borderWidth: 1.5,
  },

  // 카드 헤더 — 시간 + "최근" 배지
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    ...Typography.label.m,
    color: Colors.text.secondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  latestChip: {
    paddingHorizontal: Spacing[10],
    paddingVertical: 3,
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
  },
  latestChipText: {
    ...Typography.label.s,
    color: Colors.brand.onPrimary,
    fontWeight: '700',
  },

  // 느낌 태그
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6] },
  tagChip: {
    backgroundColor: Colors.bg.tertiary,
    borderRadius: Radius.round,
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[4],
  },
  tagText: { ...Typography.label.s, color: Colors.text.secondary, fontWeight: '600' },

  // 메모
  note: {
    ...Typography.body.s,
    color: Colors.text.primary,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // 사진
  photoImage: {
    width: '100%',
    height: 180,
    borderRadius: Radius.s,
    backgroundColor: Colors.bg.secondary,
  },

  // 공개 범위 배지
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing[2],
  },
  visibilityText: { ...Typography.caption, color: Colors.text.tertiary },
});
