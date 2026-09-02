/**
 * 장소 키비주얼 — 홈 '오늘의 추천' 카드와 장소 상세가 함께 쓰는 한 벌
 *
 * 왜 컴포넌트로 뺐나:
 *   같은 그림인데 두 화면이 각자 그리고 있어서 조금씩 어긋났다.
 *   스크림 농도(0.72 / 0.78), 좌우 여백(16 / 20), 저장 아이콘 색(주황 / 흰색),
 *   저장 수 유무, 카테고리 배지 유무가 전부 달랐다.
 *   눈에 확 띄진 않지만 두 화면을 오갈 때 "같은 것"으로 안 읽힌다.
 *   스타일을 각자 맞추면 다음에 또 갈라지므로, 아예 한 곳에서만 그린다.
 *
 * 화면별로 다른 것은 슬롯(topLeft/topRight)과 높이뿐이다.
 *   홈   : height 228, topLeft = '오늘의 추천' 배지
 *   상세 : height 260, topRight = '검토 중' 칩
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { Icon } from '../common/Icon';
import { CategoryThumb } from './SpotCard';

/**
 * 스크림은 **사진이 있을 때만** 어둡게 깐다.
 *
 * 어두운 스크림의 목적은 '어떤 밝기의 사진이 와도 흰 글씨가 읽히게' 하는 보험이다.
 * 그런데 사진이 없는 카드는 배경이 우리가 정한 연한 피치(brand.subtle)라
 * 밝기를 이미 알고 있다 — 보험이 필요 없는데 브랜드 주황만 탁하게 만들었다.
 * (출시 초기엔 대부분의 카드가 사진 없는 상태라 첫인상이 계속 어두웠다.)
 *
 * 사진 없음 → 옅은 피치 페이드 + 어두운 글씨. 브랜드 색이 살고 카드가 가벼워진다.
 */
const PHOTO_SCRIM: readonly [string, string, string] =
  ['transparent', 'rgba(18,12,6,0.20)', 'rgba(18,12,6,0.78)'];
/** 아이콘 위 — 글자가 아이콘과 겹치는 구간만 살짝 눌러 대비를 확보한다. */
const ICON_SCRIM: readonly [string, string, string] =
  ['transparent', 'rgba(255,240,230,0.60)', 'rgba(255,226,208,0.96)'];
const SCRIM_LOCATIONS: readonly [number, number, number] = [0, 0.45, 1];

/** 사진 위에서는 흰 글씨, 아이콘 위에서는 짙은 갈색 계열을 쓴다. */
const ON_PHOTO = {
  name:  '#FFFFFF',
  meta:  'rgba(255,255,255,0.92)',
  metaIcon: 'rgba(255,255,255,0.85)',
  save:  '#FFFFFF',
} as const;
const ON_ICON = {
  name:  '#3A1F0E',
  meta:  '#8A5A3C',
  metaIcon: '#8A5A3C',
  save:  Colors.brand.accent,
} as const;

interface SpotKeyVisualProps {
  height: number;
  name: string;
  categoryLabel: string;
  subcategory?: string | null;
  coverImageUrl?: string | null;
  /** 이름 아래 한 줄 — 지역·거리 등. 없으면 줄 자체를 그리지 않는다. */
  metaText?: string | null;
  /** 저장한 사람 수. 0도 그대로 보여준다(숨기면 아이콘 아래 높이가 들쭉날쭉하다). */
  savedCount: number;
  saved: boolean;
  onSave: () => void;
  /** 좌상단 슬롯 — 홈의 '오늘의 추천' 배지 */
  topLeft?: React.ReactNode;
  /** 우상단 슬롯 — 상세의 '검토 중' 칩 */
  topRight?: React.ReactNode;
}

export function SpotKeyVisual({
  height, name, categoryLabel, subcategory, coverImageUrl, metaText,
  savedCount, saved, onSave, topLeft, topRight,
}: SpotKeyVisualProps) {
  const hasPhoto = !!coverImageUrl;
  const ink = hasPhoto ? ON_PHOTO : ON_ICON;

  return (
    <View style={[s.root, { height }]}>
      <CategoryThumb
        categoryLabel={categoryLabel}
        subcategory={subcategory}
        coverImageUrl={coverImageUrl ?? undefined}
        size={height}
        width="100%"
        rounded={0}
      />

      <LinearGradient
        colors={hasPhoto ? PHOTO_SCRIM : ICON_SCRIM}
        locations={SCRIM_LOCATIONS}
        style={s.scrim}
        pointerEvents="none"
      />

      {topLeft && <View style={s.topLeft} pointerEvents="none">{topLeft}</View>}
      {topRight && <View style={s.topRight} pointerEvents="none">{topRight}</View>}

      {/* [좌: 카테고리·이름·메타] [우: 저장]
          저장을 텍스트와 같은 줄에 넣으면 상태·자릿수가 바뀔 때마다 이름이 밀린다.
          형제로 분리하고 저장 폭을 고정한다.
          box-none: 오버레이는 터치를 통과시키되 저장 버튼은 받는다. */}
      <View style={s.overlay} pointerEvents="box-none">
        <View style={s.info} pointerEvents="none">
          <View style={s.badgeRow}>
            <View style={s.badge}>
              <Icon name="leaf-filled" size={11} color={Colors.brand.primary} />
              <Text style={s.badgeText}>{categoryLabel}</Text>
            </View>
          </View>
          <Text
            style={[s.name, { color: ink.name }, !hasPhoto && s.nameNoShadow]}
            numberOfLines={2}
          >{name}</Text>
          {!!metaText && (
            <View style={s.metaRow}>
              <Icon name="location" size={12} color={ink.metaIcon} />
              <Text style={[s.meta, { color: ink.meta }]} numberOfLines={1}>{metaText}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={s.saveBtn}
          onPress={onSave}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={saved ? '저장 해제' : '저장하기'}
          accessibilityState={{ selected: saved }}
        >
          {/* 사진 위에서는 주황이 안 보여 흰색을 쓴다. 아이콘 위에서는 반대로
              흰색이 묻히므로 짙은 주황(대비 4.5:1 확보분)을 쓴다. */}
          <Icon name={saved ? 'bookmark-filled' : 'bookmark'} size={26} color={ink.save} />
          <Text style={[s.saveCount, { color: ink.save }, !hasPhoto && s.nameNoShadow]}>{savedCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    width: '100%',
    position: 'relative',
    backgroundColor: Colors.bg.tertiary,
    overflow: 'hidden',
  },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },

  topLeft:  { position: 'absolute', top: Spacing[14], left: Spacing[14] },
  topRight: { position: 'absolute', top: Spacing[14], right: Spacing[14] },

  overlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing[20],
    paddingBottom: Spacing[20],
    paddingTop: Spacing[40],
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing[12],
  },
  info: { flex: 1, minWidth: 0, gap: Spacing[6] },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  badgeText: { ...Typography.caption, color: Colors.brand.primary, fontWeight: '700' },

  name: {
    ...Typography.display.s,
    color: '#FFFFFF',
    fontWeight: '800',
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  /** 밝은 배경 위에서는 텍스트 그림자가 때처럼 보인다 — 끈다. */
  nameNoShadow: { textShadowColor: 'transparent', textShadowRadius: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4], marginTop: 2 },
  meta: {
    ...Typography.label.s,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
    flexShrink: 1,
  },

  // 폭 고정 — 저장 상태·자릿수가 바뀌어도 좌측 텍스트가 흔들리지 않는다
  saveBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingBottom: 2,
  },
  saveCount: {
    ...Typography.label.s,
    color: '#FFFFFF',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
