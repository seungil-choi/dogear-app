import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';
import type { AtmosphereState, RegularStatus, VisibilityLevel } from '../../types';

// ─── 분위기 배지 ─────────────────────────────
export function AtmosphereBadge({ state }: { state: AtmosphereState }) {
  const style = Colors.status[state === 'unknown' ? 'info' : state as keyof typeof Colors.status] ?? Colors.status.info;
  return (
    <View style={[s.chip, { backgroundColor: (style as any).bg }]}>
      <Text style={[s.text, { color: (style as any).text }]}>
        {state === 'quiet' ? '한적한 편' : state === 'active' ? '활발한 편' : state === 'mixed' ? '분위기 섞여 있음' : '흔적 없음'}
      </Text>
    </View>
  );
}

// ─── 단골 배지 ─────────────────────────────
export function RegularBadge({ status }: { status: RegularStatus }) {
  if (status === 'none') return null;
  const isRegular = status === 'regular';
  return (
    <View style={[s.chip, { backgroundColor: isRegular ? Colors.brand.primaryLight : Colors.bg.tertiary }]}>
      <Text style={[s.text, { color: isRegular ? Colors.brand.primary : Colors.text.secondary }]}>
        {isRegular ? '단골 스팟' : '자주 찾는 스팟'}
      </Text>
    </View>
  );
}

// ─── 최근 흔적 배지 ─────────────────────────────
export function TraceBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={[s.chip, { backgroundColor: Colors.status.recent.bg }]}>
      <Text style={[s.text, { color: Colors.status.recent.text }]}>
        최근 흔적 {count}건
      </Text>
    </View>
  );
}

// ─── 공개 범위 칩 ─────────────────────────────
export function PrivacyChip({ level, onPress, selected }: { level: VisibilityLevel; onPress?: () => void; selected?: boolean }) {
  const colorMap = {
    private: Colors.safety.private,
    spot_only: Colors.safety.spotOnly,
    familiar_layer: Colors.safety.familiarLayer,
  };
  const c = colorMap[level];
  const labelMap = {
    private: '나만 보기',
    spot_only: '장소 분위기에만',
    familiar_layer: '익숙한 강아지까지',
  };
  return (
    <View style={[s.privacyChip, { backgroundColor: selected ? c.bg : Colors.bg.secondary, borderColor: selected ? c.dot : Colors.border.default, borderWidth: 1.5 }]}>
      <View style={[s.privacyDot, { backgroundColor: c.dot }]} />
      <Text style={[s.text, { color: selected ? c.text : Colors.text.secondary }]}>
        {labelMap[level]}
      </Text>
    </View>
  );
}

// ─── 범용 텍스트 배지 ─────────────────────────────
export function TextBadge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.text, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing[8],
    paddingVertical: Spacing[4],
    borderRadius: Radius.round,
  },
  text: { ...Typography.label.s },
  privacyChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[4],
    paddingHorizontal: Spacing[10], paddingVertical: Spacing[6],
    borderRadius: Radius.round,
  },
  privacyDot: { width: 6, height: 6, borderRadius: 3 },
});
