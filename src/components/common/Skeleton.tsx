/**
 * Skeleton — 로딩 스켈레톤 컴포넌트
 *
 * Animated.loop으로 shimmer 효과를 만든다.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius } from '@/constants/tokens';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius = Radius.s, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

// ─── 복합 스켈레톤 ───────────────────────────────────

/** HomeSpotRail 로딩 스켈레톤 */
export function HomeRailSkeleton() {
  return (
    <View style={styles.rail}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.railCard}>
          <Skeleton height={80} radius={Radius.m} style={styles.mb6} />
          <Skeleton width="70%" height={12} style={styles.mb4} />
          <Skeleton width="50%" height={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.border.default,
  },
  rail: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  railCard: {
    flex: 1,
  },
  mb4: { marginBottom: 4 },
  mb6: { marginBottom: 6 },
});
