import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Button } from '../../src/components/common/Button';
import { Icon, type IconName } from '../../src/components/common/Icon';

const SLIDES: {
  key: string;
  icon: IconName;
  iconColor: string;
  bg: string;
  title: string;
  desc: string;
}[] = [
  {
    key: 'discover',
    icon: 'map-filled',
    iconColor: '#3B82F6',
    bg: '#EBF4FF',
    title: '우리 동네 산책 지도',
    desc: '강아지 친화적인 장소를\n지도에서 한눈에 찾아봐요.',
  },
  {
    key: 'paw',
    icon: 'paw-filled',
    iconColor: Colors.brand.primary,
    bg: Colors.brand.subtle,
    title: '발도장으로 기억 쌓기',
    desc: '산책한 장소마다 발도장을 남기면\n우리 아이만의 산책 기록이 쌓여요.',
  },
  {
    key: 'familiar',
    icon: 'dog',
    iconColor: '#E76F35',
    bg: '#FDF0EB',
    title: '산책 친구 찾기',
    desc: '같은 장소를 자주 찾는 강아지를 자연스럽게 발견하고\n편안하고 안전한 인연을 이어가요.',
  },
  {
    key: 'privacy',
    icon: 'lock',
    iconColor: '#3B5BA9',
    bg: '#EEF3FA',
    title: '내 정보는 내가 조절해요',
    desc: '공개 범위를 내가 직접 정할 수 있어요.\n안전 조건을 충족한 강아지에게만\n우리 아이가 보여져요.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = useAppStore(s => s.completeOnboarding);
  const [current, setCurrent] = useState(0);

  const isLast = current === SLIDES.length - 1;
  const slide = SLIDES[current];

  const handleNext = () => {
    if (isLast) {
      completeOnboarding();
      router.replace('/(auth)/login');
    } else {
      setCurrent(c => c + 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* 건너뛰기 */}
      <View style={s.topBar}>
        {!isLast ? (
          <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
            <Text style={s.skipText}>건너뛰기</Text>
          </TouchableOpacity>
        ) : <View />}
      </View>

      {/* 슬라이드 콘텐츠 */}
      <View style={s.slideArea}>
        {/* 아이콘 원 */}
        <View style={[s.iconCircle, { backgroundColor: slide.bg }]}>
          <Icon name={slide.icon} size={84} color={slide.iconColor} />
        </View>

        {/* 텍스트 */}
        <Text style={s.title}>{slide.title}</Text>
        <Text style={s.desc}>{slide.desc}</Text>
      </View>

      {/* 인디케이터 */}
      <View style={s.indicators}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => setCurrent(i)}>
            <View style={[s.dot, i === current && s.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* 하단 버튼 */}
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

  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[8],
    minHeight: 44,
  },
  skipBtn: { padding: Spacing[10] },
  skipText: { ...Typography.label.m, color: Colors.text.tertiary },

  slideArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[32],
    gap: Spacing[24],
  },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[8],
  },
  emoji: {
    fontSize: 80,
    lineHeight: 96,
  },
  title: {
    ...Typography.display.m,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  desc: {
    ...Typography.body.l,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 28,
  },

  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[8],
    paddingVertical: Spacing[20],
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.border.default,
  },
  dotActive: {
    backgroundColor: Colors.brand.primary,
    width: 24,
    borderRadius: 4,
  },

  footer: {
    padding: Spacing[16],
    paddingBottom: Spacing[32],
  },
});
