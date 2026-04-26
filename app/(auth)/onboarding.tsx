import React, { useState, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView,
  Dimensions, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Button } from '../../src/components/common/Button';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'discover',
    emoji: '🗺️',
    title: '우리 동네 산책 지도',
    desc: '강아지 친화적인 장소를\n지도에서 한눈에 찾아봐요.',
  },
  {
    key: 'paw',
    emoji: '🐾',
    title: '발도장으로 기억 쌓기',
    desc: '산책한 장소마다 발도장을 남기면\n우리 아이만의 산책 기록이 쌓여요.',
  },
  {
    key: 'familiar',
    emoji: '🐶',
    title: '산책 친구 찾기',
    desc: '같은 장소를 자주 찾는 강아지를 자연스럽게 발견하고\n편안하고 안전한 인연을 이어가요.',
  },
  {
    key: 'privacy',
    emoji: '🔒',
    title: '내 정보는 내가 조절해요',
    desc: '공개 범위를 내가 직접 정할 수 있어요.\n안전 조건을 충족한 강아지에게만\n우리 아이가 보여져요.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = useAppStore(s => s.completeOnboarding);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const isLast = currentIndex === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      completeOnboarding();
      router.replace('/(auth)/login');
    } else {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.safe}>
      <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
        <Text style={s.skipText}>건너뛰기</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <Text style={s.slideEmoji}>{item.emoji}</Text>
            <Text style={s.slideTitle}>{item.title}</Text>
            <Text style={s.slideDesc}>{item.desc}</Text>
          </View>
        )}
      />

      {/* 페이지 인디케이터 */}
      <View style={s.indicators}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === currentIndex && s.dotActive]} />
        ))}
      </View>

      <View style={s.footer}>
        <Button
          label={isLast ? '시작하기' : '다음'}
          onPress={handleNext}
          variant="primary"
          size="l"
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  skipBtn: {
    alignSelf: 'flex-end',
    padding: Spacing[16],
  },
  skipText: { ...Typography.label.m, color: Colors.text.tertiary },

  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[32],
    gap: Spacing[20],
  },
  slideEmoji: { fontSize: 80 },
  slideTitle: { ...Typography.display.m, color: Colors.text.primary, textAlign: 'center' },
  slideDesc: { ...Typography.body.l, color: Colors.text.secondary, textAlign: 'center', lineHeight: 26 },

  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[8],
    paddingVertical: Spacing[16],
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border.default },
  dotActive: { backgroundColor: Colors.brand.primary, width: 20 },

  footer: {
    padding: Spacing[16],
    paddingBottom: Spacing[32],
  },
});
