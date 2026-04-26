import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { Icon } from './Icon';
import type { TraceListItemViewModel } from '../../types';

interface Props {
  trace: TraceListItemViewModel;
  showDivider?: boolean;
}

export function TraceItem({ trace, showDivider = true }: Props) {
  return (
    <View style={[s.row, showDivider && s.divider]}>
      {/* 아이콘 */}
      <View style={s.iconWrap}>
        <Icon name="paw-filled" size={16} color={Colors.brand.primary} />
      </View>

      {/* 내용 */}
      <View style={s.content}>
        {/* 시간 */}
        <Text style={s.time}>{trace.relative_time_text}</Text>

        {/* 태그 + 사진/메모 뱃지 */}
        <View style={s.badgeRow}>
          {trace.primary_tag_label ? (
            <View style={s.tagBadge}>
              <Text style={s.tagText}>{trace.primary_tag_label}</Text>
            </View>
          ) : null}
          {(trace.photo_count ?? 0) > 0 && (
            <View style={s.photoBadge}>
              <Icon name="camera" size={11} color={Colors.brand.primary} />
              <Text style={s.photoText}>사진 {trace.photo_count}장</Text>
            </View>
          )}
          {trace.secondary_text && !(trace.photo_count ?? 0) && (
            <View style={s.noteBadge}>
              <Text style={s.noteText} numberOfLines={1}>{trace.secondary_text}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 화살표 */}
      <Icon name="forward" size={14} color={Colors.border.strong} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[14],
    paddingHorizontal: Spacing[16],
    gap: Spacing[12],
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  content: { flex: 1, gap: Spacing[6] },
  time: { ...Typography.label.s, color: Colors.text.primary, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: Spacing[6], flexWrap: 'wrap' },
  tagBadge: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[10],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  tagText: { ...Typography.label.s, color: Colors.text.secondary },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[10],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  photoText: { ...Typography.label.s, color: Colors.brand.primary },
  noteBadge: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[10],
    paddingVertical: 3,
    borderRadius: Radius.round,
    maxWidth: 160,
  },
  noteText: { ...Typography.label.s, color: Colors.text.tertiary },
});
