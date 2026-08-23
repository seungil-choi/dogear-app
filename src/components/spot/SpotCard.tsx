import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';
import { Icon } from '../common/Icon';
import { AppImage } from '../common/AppImage';
import { parkIllustration } from '../../constants/parkIllustrations';
import type { HomeSpotCardViewModel } from '../../types';

interface CategoryThumbProps {
  categoryLabel: string;
  coverImageUrl?: string;     // 있으면 이미지 우선, 없으면 일러스트/카테고리 컬러 폴백
  subcategory?: string | null; // 공원구분 — 커버 일러스트 매핑 키 (사진 없을 때 사용)
  size: number;               // 정사각형 사이즈, 또는 height (width 별도 지정 시)
  width?: number | string;    // 가로 커스텀 (풀폭 카드 등)
  rounded?: number;
}

export function CategoryThumb({ categoryLabel, coverImageUrl, subcategory, size, width, rounded = Radius.card }: CategoryThumbProps) {
  const w = width ?? size;
  // 1순위: 실사진(cover_image_url) — 장소 상세 키비주얼과 일관
  if (coverImageUrl) {
    return (
      <View style={{ width: w as any, height: size, borderRadius: rounded, overflow: 'hidden', backgroundColor: Colors.bg.tertiary }}>
        <AppImage source={{ uri: coverImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }
  // 2순위: 공원구분/카테고리 일러스트 (번들 에셋, 무비용) — 브랜드 톤 배경 위 중앙 배치
  //   parkIllustration은 항상 값을 반환하므로 여기가 최종 폴백이다.
  return (
    <View style={{
      width: w as any, height: size, borderRadius: rounded, overflow: 'hidden',
      backgroundColor: Colors.brand.subtle,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Image
        source={parkIllustration(subcategory, categoryLabel)}
        style={{ width: '80%', height: '80%' }}
        resizeMode="contain"
      />
    </View>
  );
}

interface FeaturedProps {
  card: HomeSpotCardViewModel;
  onPress: () => void;
}

// ─── Recent Spot Card (최근 간 장소 레일) ─────────────────────────────
export function RecentSpotCard({ card, onPress }: FeaturedProps) {
  return (
    <TouchableOpacity style={sr.card} onPress={onPress} activeOpacity={0.88}>
      {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
      <View style={sr.imageWrap}>
        <CategoryThumb categoryLabel={card.category_label} subcategory={card.subcategory} coverImageUrl={card.cover_image_url} size={132} width="100%" rounded={0} />
      </View>

      {/* 텍스트 */}
      <View style={sr.body}>
        <Text style={sr.name} numberOfLines={1}>{card.name}</Text>
        <Text style={sr.meta} numberOfLines={1}>
          {card.last_visit_text ? `${card.last_visit_text}` : '방문 기록 없음'}
          {card.distance_text ? ` · ${card.distance_text}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Regular Spot Card (자주 가는 장소 레일) ─────────────────────────────
export function RegularSpotCard({ card, onPress }: FeaturedProps) {
  return (
    <TouchableOpacity style={sr.card} onPress={onPress} activeOpacity={0.88}>
      {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
      <View style={sr.imageWrap}>
        <CategoryThumb categoryLabel={card.category_label} subcategory={card.subcategory} coverImageUrl={card.cover_image_url} size={132} width="100%" rounded={0} />
        {/* 단골 뱃지 */}
        {card.is_regular && (
          <View style={sr.regularBadge}>
            <Text style={sr.regularBadgeText}>단골</Text>
          </View>
        )}
      </View>

      {/* 텍스트 */}
      <View style={sr.body}>
        <Text style={sr.name} numberOfLines={1}>{card.name}</Text>
        {card.visit_count != null && (
          <Text style={sr.visitCount}>총 {card.visit_count}회 방문</Text>
        )}
        <Text style={sr.meta} numberOfLines={1}>{card.distance_text}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── List Card (하단 시트·저장한 장소용) ─────────────────────────────
interface ListCardProps {
  name: string;
  categoryLabel: string;
  subcategory?: string | null;
  distanceText: string;
  atmosphereSummary?: string;
  relationSummary?: string;
  isSaved?: boolean;
  coverImageUrl?: string;
  /** 검토 중(사용자 제안, 미승인) — 목록에서도 정식 장소와 구분되어야 한다 */
  isPendingReview?: boolean;
  onPress: () => void;
}

export function ListSpotCard({
  name, categoryLabel, subcategory, distanceText, atmosphereSummary, relationSummary,
  isSaved, coverImageUrl, isPendingReview, onPress,
}: ListCardProps) {
  return (
    <TouchableOpacity style={s.listCard} onPress={onPress} activeOpacity={0.85}>
      {/* RN Web: TouchableOpacity는 row 레이아웃을 자식에게 전달 못할 수 있어 inner View로 강제 */}
      <View style={s.listCardInner}>
        {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
        <View style={s.listImage}>
          <CategoryThumb categoryLabel={categoryLabel} subcategory={subcategory} coverImageUrl={coverImageUrl} size={60} rounded={12} />
        </View>

        {/* 정보 */}
        <View style={s.listContent}>
          {/* 장소명 + 저장됨 인라인 */}
          <View style={s.listNameRow}>
            {/* 장소명이 길면 한 줄로 잘라내지 않고 최대 2줄로 접는다(10자 초과 기준) */}
            <Text style={s.listName} numberOfLines={name.length > 10 ? 2 : 1}>{name}</Text>
            {isSaved && (
              <View style={s.savedChip}>
                <Icon name="bookmark-filled" size={10} color={Colors.brand.primary} />
                <Text style={s.savedChipText}>저장됨</Text>
              </View>
            )}
          </View>
          {/* 방문 횟수 + 단골 스팟 인라인 */}
          <View style={s.listMetaRow}>
            <Text style={s.compactDistance}>{distanceText}</Text>
            {isPendingReview && (
              <View style={s.pendingChip}>
                <Text style={s.pendingChipText}>검토 중</Text>
              </View>
            )}
            {relationSummary && (
              <View style={s.relationChip}>
                <View style={s.relationDot} />
                <Text style={s.relationText} numberOfLines={1}>{relationSummary}</Text>
              </View>
            )}
          </View>
          {atmosphereSummary && (
            <Text style={s.subText} numberOfLines={1}>{atmosphereSummary}</Text>
          )}
        </View>

      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // ── Featured ──────────────────────────

  // ── Compact ──────────────────────────

  // ── List ──────────────────────────────
  listCard: {
    backgroundColor: Colors.surface.default,
    paddingVertical: Spacing[14],
    paddingHorizontal: Spacing[16],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.default,
  },
  listCardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[14],
  },
  listImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
  },
  listContent: { flex: 1, gap: 3 },
  listNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
    flexWrap: 'nowrap',
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
  },
  listName: { ...Typography.label.l, color: Colors.text.primary, fontWeight: '700', lineHeight: 20, flexShrink: 1 },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[8],
    paddingVertical: 2,
    borderRadius: Radius.round,
  },
  savedChipText: { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '700' },
  relationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    marginTop: 1,
  },
  relationDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.brand.primary,
  },
  relationText: { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '700' },
  subText: { ...Typography.caption, color: Colors.text.tertiary, lineHeight: 16, marginTop: 1 },

  // ── Shared ────────────────────────────

  compactDistance: { ...Typography.caption, color: Colors.text.tertiary },

  // 검토 중 칩 — 눈에 띄되 경고로 읽히지 않게. 위반이 아니라 '아직 확인 전'이다.
  pendingChip: {
    paddingHorizontal: Spacing[6],
    paddingVertical: 1,
    borderRadius: Radius.round,
    backgroundColor: Colors.surface.subtle,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  pendingChipText: { ...Typography.label.s, color: Colors.text.tertiary },


});


// ─── Recent / Regular 카드 공통 스타일 ─────────────────────────
const sr = StyleSheet.create({
  card: {
    width: 148,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  imageWrap: {
    width: '100%',
    height: 132,
    position: 'relative',
    overflow: 'hidden',
  },
  // 단골 뱃지
  regularBadge: {
    position: 'absolute',
    top: Spacing[8],
    left: Spacing[8],
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  regularBadgeText: {
    ...Typography.label.s,
    color: Colors.brand.onPrimary,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: Spacing[12],
    paddingTop: Spacing[10],
    paddingBottom: Spacing[12],
    gap: Spacing[2],
  },
  name: {
    ...Typography.label.l,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  visitCount: {
    ...Typography.label.s,
    color: Colors.brand.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  meta: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
});
