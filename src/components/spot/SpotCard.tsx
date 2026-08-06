import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';
import { Icon, type IconName } from '../common/Icon';
import { AppImage } from '../common/AppImage';
import { parkIllustration } from '../../constants/parkIllustrations';
import type { HomeSpotCardViewModel } from '../../types';

/**
 * 카테고리 컬러 박스 — 이미지 자리표시자 통일 시스템
 *  - 운영 무비용 원칙: 장소 실사 이미지 없이도 식별 가능
 *  - 카테고리별 컬러 + 라인 아이콘으로 즉시 분류 인지
 *  - 모든 spot card에서 동일하게 사용
 *  - 컬러는 Colors.category.* 토큰 SSOT 사용
 */
const CATEGORY_THUMB: Record<string, { bg: string; icon: IconName; iconColor: string }> = {
  // 한국어 라벨 기반 매핑 (categoryLabel과 일치)
  '공원':   { bg: Colors.category.park.bg,      icon: 'leaf',     iconColor: Colors.category.park.icon },
  '산책로': { bg: Colors.category.trail.bg,     icon: 'trail',    iconColor: Colors.category.trail.icon },
  '강변':   { bg: Colors.category.riverside.bg, icon: 'location', iconColor: Colors.category.riverside.icon },
  '쉼터':   { bg: Colors.category.rest.bg,      icon: 'rest',     iconColor: Colors.category.rest.icon },
  '기타':   { bg: Colors.category.other.bg,     icon: 'paw',      iconColor: Colors.category.other.icon },
};

interface CategoryThumbProps {
  categoryLabel: string;
  coverImageUrl?: string;     // 있으면 이미지 우선, 없으면 일러스트/카테고리 컬러 폴백
  subcategory?: string | null; // 공원구분 — 커버 일러스트 매핑 키 (사진 없을 때 사용)
  size: number;               // 정사각형 사이즈, 또는 height (width 별도 지정 시)
  width?: number | string;    // 가로 커스텀 (풀폭 카드 등)
  iconSize?: number;
  rounded?: number;
}

export function CategoryThumb({ categoryLabel, coverImageUrl, subcategory, size, width, iconSize, rounded = Radius.card }: CategoryThumbProps) {
  const w = width ?? size;
  // 1순위: 실사진(cover_image_url) — 장소 상세 키비주얼과 일관
  if (coverImageUrl) {
    return (
      <View style={{ width: w as any, height: size, borderRadius: rounded, overflow: 'hidden', backgroundColor: Colors.bg.tertiary }}>
        <AppImage source={{ uri: coverImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }
  // 2순위: 공원구분 일러스트 (번들 에셋, 무비용) — 브랜드 톤 배경 위 중앙 배치
  const illo = parkIllustration(subcategory, categoryLabel);
  if (illo) {
    return (
      <View style={{
        width: w as any, height: size, borderRadius: rounded, overflow: 'hidden',
        backgroundColor: Colors.brand.subtle,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Image source={illo} style={{ width: '80%', height: '80%' }} resizeMode="contain" />
      </View>
    );
  }
  // 3순위: 카테고리 컬러 + 라인 아이콘
  const conf = CATEGORY_THUMB[categoryLabel] ?? CATEGORY_THUMB['기타'];
  const color = conf.iconColor;
  return (
    <View style={{
      width: w as any, height: size, borderRadius: rounded,
      backgroundColor: conf.bg,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon name={conf.icon} size={iconSize ?? Math.round(size * 0.42)} color={color} />
    </View>
  );
}

interface FeaturedProps {
  card: HomeSpotCardViewModel;
  onPress: () => void;
}

// ─── Featured Card (홈 상단 추천 1개) ─────────────────────────────
export function FeaturedSpotCard({ card, onPress }: FeaturedProps) {
  return (
    <TouchableOpacity style={s.featured} onPress={onPress} activeOpacity={0.88}>
      {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
      <View style={s.featuredImage}>
        <CategoryThumb categoryLabel={card.category_label} subcategory={card.subcategory} coverImageUrl={card.cover_image_url} size={128} width={128} iconSize={36} rounded={0} />
        {card.is_regular && (
          <View style={s.featuredRegularBadge}>
            <Text style={s.featuredRegularText}>단골</Text>
          </View>
        )}
      </View>

      {/* 정보 영역 */}
      <View style={s.featuredContent}>
        <Text style={s.categoryLabel}>{card.category_label}</Text>
        <Text style={s.name} numberOfLines={1}>{card.name}</Text>
        <Text style={s.distance}>{card.distance_text}</Text>

        {/* 분위기 배지 */}
        <View style={s.badgeRow}>
          {card.atmosphere_badges.slice(0, 3).map(b => (
            <View key={b} style={s.badge}>
              <Text style={s.badgeText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* 하단 화살표 힌트 */}
        <View style={s.featuredCta}>
          <Text style={s.featuredCtaText}>자세히 보기</Text>
          <Icon name="forward" size={13} color={Colors.brand.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Compact Card (레일용) ─────────────────────────────
export function CompactSpotCard({ card, onPress }: FeaturedProps) {
  return (
    <TouchableOpacity style={s.compact} onPress={onPress} activeOpacity={0.88}>
      {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
      <View style={s.compactImage}>
        <CategoryThumb categoryLabel={card.category_label} subcategory={card.subcategory} coverImageUrl={card.cover_image_url} size={100} width={168} iconSize={28} rounded={0} />
        {card.is_regular && (
          <View style={s.compactRegularDot} />
        )}
      </View>

      {/* 정보 영역 */}
      <View style={s.compactContent}>
        <Text style={s.compactCategory}>{card.category_label}</Text>
        <Text style={s.compactName} numberOfLines={1}>{card.name}</Text>
        <Text style={s.compactDistance}>{card.distance_text}</Text>

        {/* 분위기 배지 */}
        <View style={s.badgeRow}>
          {card.atmosphere_badges.slice(0, 1).map(b => (
            <View key={b} style={s.badge}>
              <Text style={s.badgeText}>{b}</Text>
            </View>
          ))}
          {card.has_visited && (
            <View style={[s.badge, s.visitedBadge]}>
              <Text style={[s.badgeText, { color: Colors.brand.accent }]}>가봤어요</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Recent Spot Card (최근 간 장소 레일) ─────────────────────────────
export function RecentSpotCard({ card, onPress }: FeaturedProps) {
  return (
    <TouchableOpacity style={sr.card} onPress={onPress} activeOpacity={0.88}>
      {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
      <View style={sr.imageWrap}>
        <CategoryThumb categoryLabel={card.category_label} subcategory={card.subcategory} coverImageUrl={card.cover_image_url} size={132} width="100%" iconSize={28} rounded={0} />
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
        <CategoryThumb categoryLabel={card.category_label} subcategory={card.subcategory} coverImageUrl={card.cover_image_url} size={132} width="100%" iconSize={28} rounded={0} />
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
  onPress: () => void;
}

export function ListSpotCard({
  name, categoryLabel, subcategory, distanceText, atmosphereSummary, relationSummary,
  isSaved, coverImageUrl, onPress,
}: ListCardProps) {
  return (
    <TouchableOpacity style={s.listCard} onPress={onPress} activeOpacity={0.85}>
      {/* RN Web: TouchableOpacity는 row 레이아웃을 자식에게 전달 못할 수 있어 inner View로 강제 */}
      <View style={s.listCardInner}>
        {/* 이미지 있으면 AppImage / 없으면 카테고리 컬러 박스 */}
        <View style={s.listImage}>
          <CategoryThumb categoryLabel={categoryLabel} subcategory={subcategory} coverImageUrl={coverImageUrl} size={60} iconSize={22} rounded={12} />
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
  featured: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    flexDirection: 'row',
    marginHorizontal: Spacing[16],
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  featuredImage: {
    width: 128,
    position: 'relative',
    overflow: 'hidden',
  },
  featuredImg: { width: '100%', height: '100%' },
  featuredImgPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredRegularBadge: {
    position: 'absolute',
    top: Spacing[8],
    left: Spacing[8],
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: Spacing[6],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  featuredRegularText: { ...Typography.label.s, color: Colors.brand.onPrimary, fontWeight: '700' },
  featuredContent: {
    flex: 1,
    padding: Spacing[16],
    gap: Spacing[4],
    justifyContent: 'center',
  },
  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: Spacing[6],
  },
  featuredCtaText: { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '600' },

  // ── Compact ──────────────────────────
  compact: {
    width: 168,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  compactImage: {
    height: 100,
    position: 'relative',
    overflow: 'hidden',
  },
  compactImg: { width: '100%', height: '100%' },
  compactImgPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRegularDot: {
    position: 'absolute',
    top: Spacing[8],
    right: Spacing[8],
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.primary,
  },
  compactContent: {
    padding: Spacing[14],
    paddingTop: Spacing[12],
    paddingBottom: Spacing[14],
    gap: Spacing[4],
  },

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
  listImg: { width: '100%', height: '100%' },
  listImgPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
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
  categoryLabel: { ...Typography.caption, color: Colors.text.tertiary },
  name:          { ...Typography.title.s, color: Colors.text.primary },
  distance:      { ...Typography.caption, color: Colors.text.tertiary },

  compactCategory: { ...Typography.caption, color: Colors.text.tertiary },
  compactName:     { ...Typography.label.l, color: Colors.text.primary, fontWeight: '600' },
  compactDistance: { ...Typography.caption, color: Colors.text.tertiary },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[4], marginTop: Spacing[6] },
  badge: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[4],
    borderRadius: Radius.round,
  },
  badgeText: { ...Typography.label.s, color: Colors.text.secondary },
  visitedBadge: {
    backgroundColor: Colors.surface.selected,
  },

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
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
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
