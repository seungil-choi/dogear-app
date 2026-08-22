/**
 * 토스트 표시기 — 앱 루트에 한 번만 마운트한다.
 * toast.success/error/info 호출 시 하단에 잠깐 떴다가 자동으로 사라진다.
 * 연달아 호출된 것은 큐에서 차례로 표시한다(앞 메시지가 잘리지 않게).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, type ToastVariant } from '../../utils/toast';
import { Typography, Radius, Spacing } from '../../constants/tokens';
import { Icon } from './Icon';

/** 변형별 배경·아이콘 — 성공/실패를 색으로 즉시 구분(§2 메시지 3분류) */
const VARIANT: Record<ToastVariant, { bg: string; icon: string | null }> = {
  info:    { bg: 'rgba(34,34,34,0.92)',   icon: null },
  success: { bg: 'rgba(21,128,61,0.95)',  icon: 'check' },
  error:   { bg: 'rgba(185,28,28,0.95)',  icon: 'bell' },
};

export function ToastHost() {
  const current = useToastStore(s => s.current);
  const next = useToastStore(s => s.next);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!current) return;
    opacity.setValue(0);
    translateY.setValue(12);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]);
    // 끝나면 큐의 다음 항목으로 넘어간다(없으면 null → 사라짐)
    anim.start(({ finished }) => { if (finished) next(); });
    return () => anim.stop();
    // current.id로 갱신 — 같은 문구가 연속으로 와도 애니메이션이 다시 돈다
  }, [current?.id, next, opacity, translateY]);

  if (!current) return null;
  const v = VARIANT[current.variant];

  return (
    <View style={[s.wrap, { bottom: insets.bottom + 84 }]} pointerEvents="none">
      <Animated.View style={[s.pill, { backgroundColor: v.bg, opacity, transform: [{ translateY }] }]}>
        {v.icon && <Icon name={v.icon as any} size={15} color="#FFFFFF" />}
        <Text style={s.text} numberOfLines={2}>{current.message}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
    maxWidth: '86%',
    paddingHorizontal: Spacing[20],
    paddingVertical: 12,
    borderRadius: Radius.round,
  },
  text: {
    ...Typography.body.m,
    color: '#FFFFFF',
    flexShrink: 1,
  },
});
