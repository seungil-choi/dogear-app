/**
 * 강아지 프로필 카드 — 홈과 내정보가 함께 쓰는 한 벌
 *
 * 왜 컴포넌트로 뺐나:
 *   같은 강아지를 보여주는 카드인데 두 화면이 각자 그려서 딴 물건처럼 보였다.
 *     배경   : 연한 브랜드색 + 1.5px 테두리 + 그림자  /  브랜드색 채움 (테두리·그림자 없음)
 *     이름   : 어두운 글씨 title.m                     /  흰 글씨 title.l
 *     아바타 : 68                                      /  72
 *     태그   : 연한 브랜드 배경 + 강조색 글씨          /  반투명 흰 배경 + 흰 글씨
 *     여백   : padding 20                              /  padding 16
 *   품종·나이·체중을 잇는 규칙과 태그 3개 자르기는 양쪽에 똑같이 복사돼 있었다.
 *   SpotKeyVisual과 같은 이유로 한 곳에서만 그린다.
 *
 * 화면별로 다른 것은 슬롯과 두 개의 스위치뿐이다.
 *   홈     : onPressName(여러 마리 전환 ▾), footer(최근 산책)
 *   내정보 : showBio
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { ageGroupLabel, temperamentLabels, walkingStyleLabels } from '../../utils/labels';
import { AppImage } from '../common/AppImage';
import { Icon } from '../common/Icon';
import type { Dog } from '../../types';

/** 카드에 올릴 태그 최대 개수 — 넘으면 두 줄로 흘러 카드 높이가 들쭉날쭉해진다 */
const MAX_TAGS = 3;

interface DogProfileCardProps {
  dog: Dog;
  /** 카드 전체 탭 — 보통 강아지 상세로 */
  onPress?: () => void;
  /** 이름 옆 ▾ 탭 — 여러 마리일 때 전환. 없으면 화살표 자체를 그리지 않는다. */
  onPressName?: () => void;
  /** 소개(bio) 노출 — 내정보처럼 카드가 화면의 주인공일 때만 */
  showBio?: boolean;
  /** 태그 아래 한 줄 슬롯 — 홈의 '최근 산책' */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** 품종 · 나이 · 체중. 비어 있는 항목은 구분점까지 함께 빠진다. */
export function dogMetaText(dog: Dog): string {
  return [
    dog.breed,
    ageGroupLabel[dog.age_group],
    dog.weight_kg ? `${dog.weight_kg}kg` : null,
  ].filter(Boolean).join(' · ');
}

/** 기질 + 산책 스타일 태그. 라벨이 없는 값은 버린다. */
export function dogTagLabels(dog: Dog): string[] {
  return [
    ...dog.temperament_tags.map(t => temperamentLabels[t]),
    ...dog.walking_style_tags.map(t => walkingStyleLabels[t]),
  ].filter(Boolean).slice(0, MAX_TAGS);
}

export function DogProfileCard({
  dog, onPress, onPressName, showBio, footer, style,
}: DogProfileCardProps) {
  const meta = dogMetaText(dog);
  const tags = dogTagLabels(dog);

  return (
    <TouchableOpacity
      style={[s.card, style]}
      onPress={onPress}
      activeOpacity={0.9}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dog.name} 상세`}
    >
      <View style={s.top}>
        <View style={s.avatarWrap}>
          {dog.avatar_url ? (
            <AppImage source={{ uri: dog.avatar_url }} style={s.avatarImg} resizeMode="cover" />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Icon name="dog" size={34} color={Colors.brand.primary} />
            </View>
          )}
        </View>

        <View style={s.info}>
          {/* 이름 줄은 강아지가 여러 마리일 때만 따로 눌린다(전환 ▾).
              한 마리면 Touchable을 아예 그리지 않는다 — disabled로 두면 그 자리에서만
              카드 탭이 먹지 않을 위험이 있어(중첩 Touchable의 responder 처리),
              "이름을 눌렀는데 상세가 안 열린다"가 된다. */}
          {onPressName ? (
            <TouchableOpacity
              style={s.nameRow}
              onPress={onPressName}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="다른 강아지 선택"
            >
              <Text style={s.name} numberOfLines={1}>{dog.name}</Text>
              <Icon name="down" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={s.nameRow}>
              <Text style={s.name} numberOfLines={1}>{dog.name}</Text>
            </View>
          )}
          {!!meta && <Text style={s.meta} numberOfLines={1}>{meta}</Text>}
        </View>
      </View>

      {showBio && !!dog.bio && <Text style={s.bio} numberOfLines={2}>{dog.bio}</Text>}

      {tags.length > 0 && (
        <View style={s.tagRow}>
          {tags.map(tag => (
            <View key={tag} style={s.tag}>
              <Text style={s.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {footer}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    padding: Spacing[16],
    borderRadius: Radius.card,
    backgroundColor: Colors.brand.primary,
    gap: Spacing[12],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing[14] },

  avatarWrap: {
    width: 72, height: 72, borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: Colors.brand.subtle,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brand.subtle,
  },

  info: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  name: {
    ...Typography.title.l,
    color: '#FFFFFF',
    fontWeight: '800',
    flexShrink: 1,
  },
  meta: { ...Typography.label.m, color: 'rgba(255,255,255,0.9)' },

  bio: {
    ...Typography.body.s,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 19,
  },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6] },
  tag: {
    paddingHorizontal: Spacing[10], paddingVertical: 4,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tagText: { ...Typography.label.s, color: '#FFFFFF', fontWeight: '600' },
});

/** 카드 위에 올리는 보조 정보 한 줄 — 카드가 브랜드색이라 색을 여기서 맞춰준다. */
export const dogCardFooterStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  text: { ...Typography.label.s, color: 'rgba(255,255,255,0.9)' },
});
