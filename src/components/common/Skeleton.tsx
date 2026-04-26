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

/** SpotCard 로딩 스켈레톤 */
export function SpotCardSkeleton() {
  return (
    <View style={styles.spotCard}>
      <Skeleton width={56} height={56} radius={Radius.m} style={styles.spotCardImage} />
      <View style={styles.spotCardContent}>
        <Skeleton width="60%" height={14} style={styles.mb6} />
        <Skeleton width="40%" height={12} style={styles.mb6} />
        <Skeleton width="80%" height={12} />
      </View>
    </View>
  );
}

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

/** SpotDetail 헤더 스켈레톤 */
export function SpotDetailHeaderSkeleton() {
  return (
    <View style={styles.detailHeader}>
      <Skeleton height={200} radius={0} style={styles.mb12} />
      <View style={styles.detailMeta}>
        <Skeleton width="50%" height={20} style={styles.mb8} />
        <Skeleton width="35%" height={14} style={styles.mb12} />
        <View style={styles.badgeRow}>
          <Skeleton width={72} height={28} radius={14} style={styles.badge} />
          <Skeleton width={72} height={28} radius={14} style={styles.badge} />
          <Skeleton width={72} height={28} radius={14} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.border.default,
  },
  spotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  spotCardImage: {
    marginRight: 12,
  },
  spotCardContent: {
    flex: 1,
  },
  rail: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  railCard: {
    flex: 1,
  },
  detailHeader: {},
  detailMeta: {
    paddingHorizontal: 20,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  badge: {
    marginRight: 8,
  },
  mb4: { marginBottom: 4 },
  mb6: { marginBottom: 6 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
});
