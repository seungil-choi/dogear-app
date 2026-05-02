/**
 * 스플래시 화면 — 앱 진입 시 브랜드 노출 (1.5s)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Icon } from '../../src/components/common/Icon';

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
      router.replace('/(tabs)');
    } else if (hasCompletedOnboarding) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/(auth)/onboarding');
    }
  }, [animDone, isAuthLoading, isAuthenticated, hasCompletedOnboarding]);

  return (
    <View style={s.container}>
      <Animated.View style={[s.brand, { transform: [{ scale }], opacity }]}>
        {/* 로고 */}
        <View style={s.iconWrap}>
          <Icon name="paw-filled" size={52} color={Colors.brand.primary} />
        </View>
        <Text style={s.appName}>Dogear</Text>
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
    backgroundColor: '#FFFDF9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[48],
  },
  brand: {
    alignItems: 'center',
    gap: Spacing[12],
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[8],
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -1,
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
