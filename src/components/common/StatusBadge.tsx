import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';
import type { AtmosphereState, RegularStatus, VisibilityLevel } from '../../types';

// ─── 분위기 배지 ─────────────────────────────
export function AtmosphereBadge({ state }: { state: AtmosphereState }) {
  const style = Colors.status[state === 'unknown' ? 'info' : state as keyof typeof Colors.status] ?? Colors.status.info;
  const label =
    state === 'quiet'  ? '한적한 편' :
    state === 'active' ? '활발한 편' :
    state === 'mixed'  ? '분위기 다양' : '흔적 없음';
  return (
    <View style={[s.chip, { backgroundColor: (style as any).bg }]}>
      <Text style={[s.chipText, { color: (style as any).text }]}>{label}</Text>
    </View>
  );
}

// ─── 단골 배지 ─────────────────────────────
export function RegularBadge({ status }: { status: RegularStatus }) {
  if (status === 'none') return null;
  const isRegular = status === 'regular';
  const bg    = isRegular ? Colors.brand.primaryLight : Colors.bg.secondary;
  const color = isRegular ? Colors.brand.accent : Colors.text.secondary;
  const label = isRegular ? '단골 스팟' : '자주 찾는 스팟';
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── 최근 흔적 배지 ─────────────────────────────
export function TraceBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={[s.chip, { backgroundColor: Colors.brand.subtle, borderWidth: 1, borderColor: Colors.border.brand }]}>
      <Text style={[s.chipText, { color: Colors.brand.accent }]}>
        흔적 {count}건
      </Text>
    </View>
  );
}

// ─── 공개 범위 칩 ─────────────────────────────
export function PrivacyChip({
  level,
  selected,
  onPress,
}: {
  level: VisibilityLevel;
  selected?: boolean;
  onPress?: () => void;
}) {
  const colorMap = {
    private:        Colors.safety.private,
    spot_only:      Colors.safety.spotOnly,
    familiar_layer: Colors.safety.familiarLayer,
  };
  const labelMap = {
    private:        '나만 보기',
    spot_only:      '장소 분위기에만',
    familiar_layer: '산책 친구 찾기',
  };
  const c = colorMap[level];
  return (
    <View
      style={[
        s.privacyChip,
        {
          backgroundColor: selected ? c.bg : Colors.bg.secondary,
          borderColor: selected ? c.dot : Colors.border.default,
        },
      ]}
    >
      <View style={[s.privacyDot, { backgroundColor: c.dot }]} />
      <Text style={[s.chipText, { color: selected ? c.text : Colors.text.secondary }]}>
        {labelMap[level]}
      </Text>
    </View>
  );
}

// ─── 범용 텍스트 배지 ─────────────────────────────
export function TextBadge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[4],
    borderRadius: Radius.round,
  },
  chipText: {
    ...Typography.label.s,
    fontWeight: '500',
  },
  privacyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    borderWidth: 1.5,
  },
  privacyDot: { width: 6, height: 6, borderRadius: 3 },
});
