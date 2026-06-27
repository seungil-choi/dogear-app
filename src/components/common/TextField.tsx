/**
 * TextField — 공용 입력 컴포넌트
 *
 * 레퍼런스 패턴(mobbin Farfetch·Coinbase·Turo) + 한국 접근성 기준(KWCAG) 반영:
 *  - 라벨 상주(상단) — placeholder만 쓰지 않음(입력 시 맥락 유지)
 *  - 포커스 = 액센트 테두리, 오류 = 빨강 테두리 + 칸 아래 인라인 메시지, 유효 = ✓
 *  - clear(×) 버튼, 명도대비/라벨/터치타깃(≥52px) 확보
 *  - 디자인은 기존 tokens.ts 유지 (새 비주얼 언어 도입 안 함)
 */
import React, { forwardRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import type { TextInputProps } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { Icon } from './Icon';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  /** 상단 상주 라벨 */
  label?: string;
  /** 오류 메시지 — 있으면 빨강 테두리 + 칸 아래 표시 */
  error?: string;
  /** 유효 표시(✓) */
  valid?: boolean;
  /** clear(×) 버튼 표시 (기본: 값 있고 포커스 시) */
  clearable?: boolean;
  /** 필수 표시(*) */
  required?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, valid, clearable = true, required, value, onChangeText, onFocus, onBlur, secureTextEntry, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const hasValue = !!value;
  const showClear = clearable && focused && hasValue && !secureTextEntry;

  const borderColor = error
    ? Colors.status.error.text
    : focused
    ? Colors.border.active
    : Colors.border.default;

  return (
    <View style={s.wrap}>
      {label ? (
        <Text style={s.label}>
          {label}
          {required ? <Text style={s.required}> *</Text> : null}
        </Text>
      ) : null}

      <View style={[s.field, { borderColor, borderWidth: focused || error ? 1.5 : 1 }]}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          placeholderTextColor={Colors.text.placeholder}
          style={s.input}
          accessibilityLabel={label ?? rest.accessibilityLabel}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />

        {valid && !error ? (
          <Icon name="check" size={18} color={Colors.status.success.text} />
        ) : showClear ? (
          <TouchableOpacity
            onPress={() => onChangeText?.('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="입력 지우기"
          >
            <Icon name="close" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    ...Typography.label.m,
    color: Colors.text.secondary,
    marginBottom: Spacing[6],
  },
  required: { color: Colors.status.error.text },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing[14],
    borderRadius: Radius.m,
    backgroundColor: Colors.bg.primary,
    gap: Spacing[8],
  },
  input: {
    flex: 1,
    ...Typography.body.m,
    color: Colors.text.primary,
    paddingVertical: Spacing[12],
  },
  error: {
    ...Typography.label.s,
    color: Colors.status.error.text,
    marginTop: Spacing[6],
    letterSpacing: 0,
  },
});
