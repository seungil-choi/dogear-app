/**
 * DogCarousel — 내 강아지 좌우 스와이프 캐러셀 (홈·내정보 공용)
 *
 * 왜 컴포넌트로 뺐나:
 *   내정보는 스와이프로 바꾸고, 홈은 이름 옆 ▾ 모달로 바꿨다. 같은 일을 두 방식으로
 *   하니 "이 앱에서 강아지는 어떻게 바꾸지?"에 답이 둘이었다.
 *   DogProfileCard를 공용으로 뺐던 것과 같은 이유로 상호작용도 한 곳에서만 만든다.
 *
 * 스와이프하면 **활성 강아지가 바뀐다** — 홈의 추천·발도장이 그 아이 기준으로 돌아간다.
 * 화면에 보이는 아이와 실제로 활동하는 아이가 다르면 안 된다.
 *
 * 여백도 여기서 갖는다. 카드 좌우 인셋과 도트 간격을 호출부가 정하게 뒀더니
 * 홈은 도트가 카드를 파고들고 내정보는 안 파고들었다(도트의 음수 마진이 한쪽
 * 화면의 marginBottom에만 맞춰져 있었다). 화면이 정하는 것은 블록 바깥 여백뿐이다.
 */
import React, { useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { Colors, Spacing } from '../../constants/tokens';
import { DogProfileCard } from './DogProfileCard';
import type { Dog } from '../../types';

/** 카드 좌우 인셋 — 두 화면 공통 */
const CARD_INSET = Spacing[16];

export function DogCarousel({
  dogs,
  activeDogId,
  onActiveChange,
  onOpenDetail,
  renderFooter,
  style,
}: {
  dogs: Dog[];
  activeDogId?: string;
  /** 스와이프로 페이지가 바뀌었을 때 */
  onActiveChange: (dog: Dog) => void;
  onOpenDetail: (dog: Dog) => void;
  /** 카드 하단 슬롯 — 내용만 화면마다 다르다(홈=최근 산책, 내정보=공개 상태) */
  renderFooter?: (dog: Dog) => React.ReactNode;
  /** 캐러셀 블록 바깥 여백만. 카드 안쪽 여백은 이 컴포넌트가 갖는다. */
  style?: StyleProp<ViewStyle>;
}) {
  // 회전·분할화면에서 폭이 바뀌면 페이지 폭도 따라가야 한다.
  // 모듈 로드 시점의 Dimensions로 굳히면 그 뒤로 페이징이 어긋난다.
  const { width } = useWindowDimensions();

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      const next = dogs[idx];
      if (next && next.dog_id !== activeDogId) onActiveChange(next);
    },
    [dogs, activeDogId, onActiveChange, width],
  );

  if (dogs.length === 0) return null;

  return (
    <View style={style}>
      <ScrollView
        horizontal
        pagingEnabled
        // 한 마리면 넘길 것이 없다 — 스크롤 자체를 막아 살짝 밀리는 느낌을 없앤다
        scrollEnabled={dogs.length > 1}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        // 소개·태그 길이가 달라 카드 높이가 제각각이면 넘길 때마다 아래가 덜컹인다.
        // 가장 높은 카드에 맞춰 늘린다.
        contentContainerStyle={s.track}
      >
        {dogs.map(d => (
          <View key={d.dog_id} style={[s.page, { width }]}>
            <DogProfileCard
              dog={d}
              showBio
              style={s.card}
              onPress={() => onOpenDetail(d)}
              footer={renderFooter?.(d)}
            />
          </View>
        ))}
      </ScrollView>

      {dogs.length > 1 && (
        <View style={s.dots}>
          {dogs.map(d => (
            <View key={d.dog_id} style={[s.dot, d.dog_id === activeDogId && s.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  track: { alignItems: 'stretch' },
  page: { paddingHorizontal: CARD_INSET },
  card: { flex: 1 },
  dots: {
    flexDirection: 'row', justifyContent: 'center',
    gap: Spacing[6], marginTop: Spacing[12],
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border.default },
  dotActive: { backgroundColor: Colors.brand.primary, width: 18 },
});
