import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
type Size = 'l' | 'm' | 's';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  label, onPress, variant = 'primary', size = 'm',
  disabled, loading, style, fullWidth = false,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? Colors.brand.onPrimary : Colors.brand.primary} />
        : <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`]]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.round,
  },
  fullWidth: { width: '100%' },

  // Variants
  primary: { backgroundColor: Colors.brand.primary },
  secondary: { backgroundColor: Colors.brand.subtle, borderWidth: 1, borderColor: Colors.brand.primary },
  tertiary: { backgroundColor: Colors.bg.primary },
  destructive: { backgroundColor: Colors.status.error.bg },

  // Sizes — min touch target 44px (Apple HIG / Material)
  size_l: { height: 54, paddingHorizontal: Spacing[24] },
  size_m: { height: 48, paddingHorizontal: Spacing[20] },
  size_s: { height: 40, paddingHorizontal: Spacing[16] },

  disabled: { opacity: 0.4 },

  // Labels
  label: {},
  label_primary: { color: Colors.brand.onPrimary },
  label_secondary: { color: Colors.brand.primary },
  label_tertiary: { color: Colors.text.secondary },
  label_destructive: { color: Colors.status.error.text },

  labelSize_l: { ...Typography.title.m },
  labelSize_m: { ...Typography.label.l, fontWeight: '600' },
  labelSize_s: { ...Typography.label.m, fontWeight: '600' },
});
