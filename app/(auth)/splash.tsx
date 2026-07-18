/**
 * 스플래시 화면 — 앱 진입 시 브랜드 노출 (1.5s)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';

export default function SplashScreen() {
  const router = useRouter();
  const isAuthenticated      = useAppStore(s => s.isAuthenticated);
  const hasCompletedOnboarding = useAppStore(s => s.hasCompletedOnboarding);
  const isAuthLoading        = useAppStore(s => s.isAuthLoading);

  const scale = React.useRef(new Animated.Value(0.85)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  // 애니메이션 완료 여부 (1.5s)
  const [animDone, setAnimDone] = React.useState(false);

  // 1. 애니메이션 시작 + 1.5초 후 animDone=true
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => setAnimDone(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // 2. animDone 되고 && 세션 복원 완료(isAuthLoading=false) 된 후 라우팅
  useEffect(() => {
    if (!animDone) return;
    if (isAuthLoading) return; // Supabase 세션 복원 중이면 대기

    if (isAuthenticated) {
      // 인증됐지만 강아지 미등록(고아 상태)이면 dog-setup으로 직행
      //   useAuth가 dogs=[] 감지 시 hasCompletedOnboarding=false로 복구
      //   → 홈에서 빈 카드 거치지 않고 바로 등록 흐름 재개
      if (!hasCompletedOnboarding) {
        router.replace('/(auth)/dog-setup');
      } else {
        router.replace('/(tabs)');
      }
    } else {
      // 온보딩(튜토리얼) 히든 처리 — 첫 진입도 바로 로그인으로 (온보딩 화면 스킵)
      router.replace('/(auth)/login');
    }
  }, [animDone, isAuthLoading, isAuthenticated, hasCompletedOnboarding]);

  return (
    <View style={s.container}>
      <Animated.View style={[s.brand, { transform: [{ scale }], opacity }]}>
        {/* 공식 로고 (마크 + DogEar 워드마크 록업) */}
        <Image
          source={require('../../assets/logo-full.png')}
          style={s.logo}
          resizeMode="contain"
          accessibilityLabel="DogEar"
        />
        <Text style={s.tagline}>우리 아이의 산책을 지도로</Text>
      </Animated.View>

      {/* 로딩 도트 */}
      <View style={s.loadingRow}>
        {[0, 1, 2].map(i => (
          <LoadingDot key={i} delay={i * 160} />
        ))}
      </View>
    </View>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(480 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        s.dot,
        {
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
        },
      ]}
    />
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[48],
  },
  brand: {
    alignItems: 'center',
    gap: Spacing[12],
  },
  logo: {
    width: 168,
    height: 200,   // 록업 비율 511:609
  },
  tagline: {
    ...Typography.body.m,
    color: Colors.text.tertiary,
    letterSpacing: 0.2,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: Spacing[8],
  },
  dot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.primary,
  },
});
