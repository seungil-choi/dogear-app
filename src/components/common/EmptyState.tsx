import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../../constants/tokens';
import { Button } from './Button';

interface Props {
  headline: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ headline, description, ctaLabel, onCta }: Props) {
  return (
    <View style={s.container}>
      <Text style={s.headline}>{headline}</Text>
      {description && <Text style={s.desc}>{description}</Text>}
      {ctaLabel && onCta && (
        <Button label={ctaLabel} onPress={onCta} variant="secondary" size="s" style={{ marginTop: Spacing[16] }} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing[32], paddingVertical: Spacing[48],
  },
  headline: { ...Typography.title.m, color: Colors.text.primary, textAlign: 'center', marginBottom: Spacing[8] },
  desc: { ...Typography.body.m, color: Colors.text.secondary, textAlign: 'center', lineHeight: 22 },
});
