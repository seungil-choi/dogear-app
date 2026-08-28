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
 */
import React, { useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, Dimensions,
  type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { Colors, Spacing } from '../../constants/tokens';
import { DogProfileCard } from './DogProfileCard';
import type { Dog } from '../../types';

const PAGE_WIDTH = Dimensions.get('window').width;

export function DogCarousel({
  dogs,
  activeDogId,
  onActiveChange,
  onOpenDetail,
  renderFooter,
  cardStyle,
}: {
  dogs: Dog[];
  activeDogId?: string;
  /** 스와이프로 페이지가 바뀌었을 때 */
  onActiveChange: (dog: Dog) => void;
  onOpenDetail: (dog: Dog) => void;
  /** 카드 하단 슬롯 — 화면마다 다르다(홈=최근 산책, 내정보=공개 상태) */
  renderFooter?: (dog: Dog) => React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
}) {
  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH);
      const next = dogs[idx];
      if (next && next.dog_id !== activeDogId) onActiveChange(next);
    },
    [dogs, activeDogId, onActiveChange],
  );

  if (dogs.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        pagingEnabled
        // 한 마리면 넘길 것이 없다 — 스크롤 자체를 막아 살짝 밀리는 느낌을 없앤다
        scrollEnabled={dogs.length > 1}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {dogs.map(d => (
          <View key={d.dog_id} style={{ width: PAGE_WIDTH }}>
            <DogProfileCard
              dog={d}
              showBio
              style={cardStyle}
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
    </>
  );
}

const s = StyleSheet.create({
  dots: {
    flexDirection: 'row', justifyContent: 'center',
    gap: Spacing[6], marginTop: -Spacing[12], marginBottom: Spacing[16],
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border.default },
  dotActive: { backgroundColor: Colors.brand.primary, width: 18 },
});
