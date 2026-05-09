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
import { feelingTagLabel, visitDateText, relativeTime } from '../../src/utils/labels';
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

// ─── 개별 발도장 행 ────────────────────────────────────────────
function CheckinRow({ checkin }: { checkin: PawCheckin }) {
  const time = new Date(checkin.checked_in_at);
  const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={r.row}>
      {/* 왼쪽: 시간 */}
      <View style={r.timeCol}>
        <Text style={r.time}>{hhmm}</Text>
      </View>

      {/* 가운데: 타임라인 선 + 점 */}
      <View style={r.timelineCol}>
        <View style={r.dot} />
        <View style={r.line} />
      </View>

      {/* 오른쪽: 내용 */}
      <View style={r.contentCol}>
        {/* 느낌 태그 칩 */}
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
            {checkin.visibility_level === 'private'
              ? '나만 보기'
              : checkin.visibility_level === 'spot_only'
              ? '장소 분위기 반영'
              : '산책 친구 찾기'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── 날짜 섹션 헤더 ────────────────────────────────────────────
function DateHeader({ date }: { date: string }) {
  return (
    <View style={r.dateHeader}>
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
          {groups.map(({ date, items }) => (
            <View key={date} style={s.group}>
              <DateHeader date={date} />
              {items.map(c => (
                <CheckinRow key={c.checkin_id} checkin={c} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── 스타일 ─────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing[16], paddingTop: Spacing[16] },

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

  // 날짜 헤더
  dateHeader: {
    paddingVertical: Spacing[8],
    marginBottom: Spacing[4],
  },
  dateText: {
    ...Typography.label.m,
    color: Colors.text.secondary,
    fontWeight: '600',
  },

  // 발도장 행
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing[4],
    minHeight: 72,
  },

  // 시간 열 (왼쪽)
  timeCol: {
    width: 44,
    alignItems: 'flex-end',
    paddingTop: 4,
    paddingRight: Spacing[8],
  },
  time: { ...Typography.caption, color: Colors.text.tertiary },

  // 타임라인 열 (가운데)
  timelineCol: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 10, height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand.primary,
    marginTop: 4,
    zIndex: 1,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border.subtle,
    marginTop: 2,
  },

  // 내용 열 (오른쪽)
  contentCol: {
    flex: 1,
    paddingLeft: Spacing[12],
    paddingBottom: Spacing[16],
    gap: Spacing[6],
  },

  // 태그
  tagRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6] },
  tagChip: {
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.round,
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[4],
  },
  tagText: { ...Typography.label.s, color: Colors.brand.primary },

  // 메모
  note: { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },

  // 사진
  photoImage: {
    width: '100%',
    height: 160,
    borderRadius: Radius.m,
    backgroundColor: Colors.bg.secondary,
  },

  // 공개 범위
  visibilityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  visibilityText: { ...Typography.caption, color: Colors.text.tertiary },
});
