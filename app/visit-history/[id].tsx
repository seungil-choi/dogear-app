/**
 * 방문 기록 상세
 *
 * 특정 장소에서 내 강아지의 전체 발도장 기록을 시간순으로 보여준다.
 * 진입: 장소 상세 "우리 [강아지]와의 관계 → 자세히 보기"
 *
 * 구조:
 *   - 상단: 장소명 + 방문 요약 (총 N회 / 첫 방문 / 마지막 방문)
 *   - 타임라인: 날짜 그룹 chip + paw dot + dashed line + 카드형 노드
 *     · 가장 최근 1개 발도장만 brand 강조 + "최근" chip
 *     · 첫/마지막 행은 위/아래 line 자동 제거
 */

import React, { useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { AppImage } from '../../src/components/common/AppImage';
import { Icon } from '../../src/components/common/Icon';
import { EmptyState } from '../../src/components/common/EmptyState';
import {
  feelingTagLabel,
  visitDateText,
  relativeTime,
  visibilityLabel,
} from '../../src/utils/labels';
import type { PawCheckin } from '../../src/types';
import { notify, actionSheet, confirm } from '../../src/utils/dialog';
import { toast } from '../../src/utils/toast';
import { DANGER, PAW } from '../../src/constants/messages';
import { supabase } from '../../src/lib/supabase';
import { IS_REAL_AUTH } from '../../src/config/env';

// ─── 유틸 ─────────────────────────────────────────────────────
type DateGroup = { date: string; items: PawCheckin[] };

/** 최신순으로 정렬된 발도장들을 visitDateText 기준으로 그룹화 (insertion order 유지 = 최신 그룹 먼저) */
function groupByDate(checkins: PawCheckin[]): DateGroup[] {
  const map = new Map<string, PawCheckin[]>();
  for (const c of checkins) {
    const key = visitDateText(c.checked_in_at);
    const bucket = map.get(key);
    if (bucket) bucket.push(c);
    else map.set(key, [c]);
  }
  return Array.from(map.entries(), ([date, items]) => ({ date, items }));
}

/** ISO 시각 → 24h "HH:mm" */
function formatHHMM(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─── 발도장 카드 (타임라인 노드) ────────────────────────────────
interface CheckinCardProps {
  checkin: PawCheckin;
  /** 타임라인 위쪽 line 숨김 */
  isFirst: boolean;
  /** 타임라인 아래쪽 line 숨김 */
  isLast: boolean;
  /** brand 강조 + "최근" chip 노출 */
  isLatest: boolean;
  /** 길게 눌러 삭제 */
  onLongPress: () => void;
}

function CheckinCard({ checkin, isFirst, isLast, isLatest, onLongPress }: CheckinCardProps) {
  const time = formatHHMM(checkin.checked_in_at);

  return (
    <View style={styles.row}>
      {/* 좌측: dashed line + paw dot */}
      <View style={styles.timelineCol}>
        <View style={[styles.lineSegment, styles.lineTop, isFirst && styles.lineHidden]} />
        <View style={[styles.dotWrap, isLatest && styles.dotWrapLatest]}>
          <Icon
            name={isLatest ? 'paw-filled' : 'paw'}
            size={12}
            color={isLatest ? Colors.brand.onPrimary : Colors.brand.primary}
          />
        </View>
        <View style={[styles.lineSegment, styles.lineBottom, isLast && styles.lineHidden]} />
      </View>

      {/* 우측: 카드 — 길게 누르면 삭제(내 기록이므로 신고는 없다) */}
      <TouchableOpacity
        style={[styles.card, isLatest && styles.cardLatest]}
        onLongPress={onLongPress}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="발도장 기록. 길게 누르면 삭제"
      >
        <View style={styles.cardHeader}>
          <Text style={styles.timeText}>{time}</Text>
          {isLatest && (
            <View style={styles.latestChip}>
              <Text style={styles.latestChipText}>최근</Text>
            </View>
          )}
        </View>

        {checkin.feeling_tags.length > 0 && (
          <View style={styles.tagRow}>
            {checkin.feeling_tags.map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{feelingTagLabel[tag] ?? tag}</Text>
              </View>
            ))}
          </View>
        )}

        {checkin.note ? <Text style={styles.note}>{checkin.note}</Text> : null}

        {checkin.photo_url && (
          <AppImage
            source={{ uri: checkin.photo_url }}
            style={styles.photo}
            resizeMode="cover"
            accessibilityLabel="발도장 사진"
          />
        )}

        <View style={styles.visibilityBadge}>
          <Icon
            name={checkin.visibility_level === 'private' ? 'lock' : 'eye'}
            size={11}
            color={Colors.text.tertiary}
          />
          <Text style={styles.visibilityText}>
            {visibilityLabel[checkin.visibility_level]}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── 날짜 그룹 chip ────────────────────────────────────────────
function DateHeader({ date }: { date: string }) {
  return (
    <View style={styles.dateChip}>
      <Text style={styles.dateText}>{date}</Text>
    </View>
  );
}

// ─── 요약 카드 ────────────────────────────────────────────────
interface SummaryCardProps {
  total: number;
  first: string;
  last: string;
}

function SummaryCard({ total, first, last }: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <SummaryCell value={`${total}회`} label="총 방문" />
      <View style={styles.summaryDivider} />
      <SummaryCell value={first} label="첫 방문" />
      <View style={styles.summaryDivider} />
      <SummaryCell value={last} label="마지막 방문" />
    </View>
  );
}

function SummaryCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryCellValue}>{value}</Text>
      <Text style={styles.summaryCellLabel}>{label}</Text>
    </View>
  );
}

// ─── 메인 스크린 ─────────────────────────────────────────────
export default function VisitHistoryScreen() {
  const { id: spotId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const spots    = useAppStore(s => s.spots);
  const checkins = useAppStore(s => s.checkins);
  const dog      = useAppStore(s => s.dog);
  const deleteCheckin = useAppStore(s => s.deleteCheckin);

  const spot = useMemo(
    () => spots.find(s => s.spot_id === spotId),
    [spots, spotId],
  );

  // 이 강아지 × 이 장소의 발도장만 최신순으로 정렬 + 날짜 그룹화 + 요약 텍스트
  const { groups, summary } = useMemo(() => {
    if (!dog) return { groups: [] as DateGroup[], summary: null };

    const my = checkins
      .filter(c => c.spot_id === spotId && c.dog_id === dog.dog_id)
      .sort((a, b) =>
        new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime(),
      );

    if (my.length === 0) return { groups: [] as DateGroup[], summary: null };

    return {
      groups: groupByDate(my),
      summary: {
        total: my.length,
        first: visitDateText(my[my.length - 1].checked_in_at),
        last:  relativeTime(my[0].checked_in_at),
      },
    };
  }, [checkins, spotId, dog]);

  // 발도장 삭제 — 내 기록이므로 신고가 아니라 삭제다.
  //   서버(delete-checkin-photo)가 딸린 사진의 스토리지 파일·대표사진·검수큐·파생집계까지
  //   함께 정리한다. 로컬 store는 그 뒤에 지운다(서버가 실패하면 화면만 지워지면 안 되므로).
  //   사진 한 장만 지우고 기록은 남기고 싶으면 장소 상세 갤러리에서 그 사진을 길게 누르면 된다.
  const handleDeleteCheckin = useCallback(async (checkin: PawCheckin) => {
    const idx = await actionSheet('이 발도장', [
      { label: '이 발도장 삭제하기', destructive: true },
    ]);
    if (idx !== 0) return;
    const ok = await confirm(
      checkin.photo_url
        ? DANGER.checkinDelete
        : '이 발도장 기록이 삭제돼요. 되돌릴 수 없어요.',
      { title: '발도장을 삭제할까요?', confirmText: '삭제', destructive: true },
    );
    if (!ok) return;
    try {
      if (IS_REAL_AUTH) {
        const { error } = await supabase.functions.invoke('delete-checkin-photo', {
          body: { checkinId: checkin.checkin_id },
        });
        if (error) throw error;
      }
      deleteCheckin(checkin.checkin_id);
      toast.success(PAW.deleted);
    } catch (e: any) {
      toast.error('발도장을 삭제하지 못했어요. 잠시 후 다시 시도해주세요');
    }
  }, [deleteCheckin]);

  const hasHistory = summary !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[8] }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.headerName} numberOfLines={1} accessibilityRole="header">
            {spot?.name ?? '장소'}
          </Text>
          <Text style={styles.headerSub}>
            {dog?.name ?? '강아지'}의 방문 기록
          </Text>
        </View>
        <View style={styles.headerRightSpacer} />
      </View>

      {!hasHistory ? (
        <EmptyState
          headline="방문 기록이 없어요"
          description="이 장소에서 발도장을 남겨보세요"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + Spacing[32] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SummaryCard {...summary} />

          {groups.map((group, gi) => {
            const isLastGroup = gi === groups.length - 1;
            return (
              <View key={group.date} style={styles.group}>
                <DateHeader date={group.date} />
                {group.items.map((checkin, ii) => {
                  const isFirstOverall = gi === 0 && ii === 0;
                  const isLastOverall  = isLastGroup && ii === group.items.length - 1;
                  return (
                    <CheckinCard
                      key={checkin.checkin_id}
                      checkin={checkin}
                      isFirst={isFirstOverall}
                      isLast={isLastOverall}
                      isLatest={isFirstOverall}
                      onLongPress={() => handleDeleteCheckin(checkin)}
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
const HEADER_RIGHT_RESERVE = 40; // 헤더 좌측 backBtn 폭에 맞춘 우측 여백 → 제목 가운데 정렬용

const styles = StyleSheet.create({
  // ── 컨테이너 ──
  safe:          { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing[20], paddingTop: Spacing[20] },
  group:         { marginBottom: Spacing[24] },

  // ── 헤더 ──
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
  headerTitle:       { flex: 1, alignItems: 'center' },
  headerName:        { ...Typography.title.s, color: Colors.text.primary },
  headerSub:         { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2 },
  headerRightSpacer: { width: HEADER_RIGHT_RESERVE },

  // ── 요약 카드 ──
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    marginBottom: Spacing[24],
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
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
  // dot wrapper — paw 아이콘이 내부에 들어감
  dotWrap: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5,
    borderColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    zIndex: 1,
  },
  dotWrapLatest: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
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
  lineTop:    { height: 14 },
  lineBottom: { flex: 1, minHeight: 24 },
  lineHidden: { opacity: 0 },

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
  tagText: {
    ...Typography.label.s,
    color: Colors.text.secondary,
    fontWeight: '600',
  },

  // 메모
  note: {
    ...Typography.body.s,
    color: Colors.text.primary,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // 사진
  photo: {
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
