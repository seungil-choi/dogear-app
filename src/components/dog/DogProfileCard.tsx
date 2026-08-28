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
 * 화면별로 다른 것은 카드 하단 슬롯 하나뿐이다.
 *   홈     : 최근 산책
 *   내정보 : 공개 상태
 * 그 슬롯도 생김새는 DogCardFooter가 갖는다 — 두 화면이 각자 그리면 또 갈라진다.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { ageGroupLabel, temperamentLabels, walkingStyleLabels } from '../../utils/labels';
import { AppImage } from '../common/AppImage';
import { Icon, type IconName } from '../common/Icon';
import type { Dog } from '../../types';

/** 카드에 올릴 태그 최대 개수 — 넘으면 두 줄로 흘러 카드 높이가 들쭉날쭉해진다 */
const MAX_TAGS = 3;

interface DogProfileCardProps {
  dog: Dog;
  /** 카드 전체 탭 — 보통 강아지 상세로 */
  onPress?: () => void;
  /** 소개(bio) 노출 — 내정보처럼 카드가 화면의 주인공일 때만 */
  showBio?: boolean;
  /** 태그 아래 한 줄 슬롯 — DogCardFooter를 넣는다 */
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
  dog, onPress, showBio, footer, style,
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
          {/* 이름 줄은 따로 눌리지 않는다. 강아지 전환은 카드를 넘겨서 한다(DogCarousel).
              중첩 Touchable을 두면 "이름을 눌렀는데 상세가 안 열린다"가 된다. */}
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{dog.name}</Text>
          </View>
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

      {/* 캐러셀은 카드 높이를 가장 높은 카드에 맞춘다. 그냥 두면 소개·태그가 짧은 아이의
          카드에서 이 줄 아래로 빈 주황색이 남는다 — 바닥에 붙여 두면 넘길 때
          구분선 높이가 그대로라 화면이 흔들리지 않는다. */}
      {!!footer && <View style={s.footerSlot}>{footer}</View>}
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

  footerSlot: { marginTop: 'auto' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6] },
  tag: {
    paddingHorizontal: Spacing[10], paddingVertical: 4,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tagText: { ...Typography.label.s, color: '#FFFFFF', fontWeight: '600' },
});

/**
 * 카드 하단 한 줄 — 홈은 '최근 산책', 내정보는 '공개 상태'.
 *
 * 내용만 다르고 생김새는 같아야 한다. 예전엔 홈이 구분선 없는 작은 글씨,
 * 내정보가 구분선 + 자물쇠였다. 같은 카드인데 아래쪽만 딴 물건이었다.
 *
 * 홈에서는 기록이 없어도 이 줄을 그린다 — 있을 때만 그리면 카드 높이가
 * 강아지마다 달라져 넘길 때 아래 내용이 덜컹거린다.
 */
export function DogCardFooter({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View>
      <View style={f.divider} />
      <View style={f.row}>
        <Icon name={icon} size={12} color="rgba(255,255,255,0.75)" />
        <Text style={f.text} numberOfLines={1}>{text}</Text>
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  // 카드 padding(16) 밖으로 빼서 선이 카드 폭을 가득 채운다
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginHorizontal: -Spacing[16],
    marginBottom: Spacing[12],   // 위(카드 gap 12)와 대칭
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  text: {
    flex: 1,
    ...Typography.label.s,
    // 태그 칩과 무게가 비슷하면 카드 하단이 웅성거린다 — 한 단계 눌러 둔다
    color: 'rgba(255,255,255,0.92)',
  },
});
