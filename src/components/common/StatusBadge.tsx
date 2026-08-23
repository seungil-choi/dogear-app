import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';
import type { VisibilityLevel } from '../../types';
import { visibilityLabel } from '../../utils/labels';

// ─── 공개 범위 칩 ─────────────────────────────
// 표시 전용 칩 — 탭 동작이 필요하면 호출부에서 감싼다(예전엔 onPress를 받고도 무시해
// 눌러도 아무 일이 없었다)
export function PrivacyChip({
  level,
  selected,
}: {
  level: VisibilityLevel;
  selected?: boolean;
}) {
  const colorMap = {
    private:        Colors.safety.private,
    spot_only:      Colors.safety.spotOnly,
    familiar_layer: Colors.safety.familiarLayer,
  };
  // 라벨은 labels.ts visibilityLabel SSOT 사용 (하드코딩 금지)
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
        {visibilityLabel[level]}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
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
