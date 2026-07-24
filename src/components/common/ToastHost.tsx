/**
 * 토스트 표시기 — 앱 루트에 한 번만 마운트한다.
 * toast('메시지') 호출 시 하단에 잠깐 떴다가 자동으로 사라진다.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../utils/toast';
import { Typography, Radius, Spacing } from '../../constants/tokens';

export function ToastHost() {
  const message = useToastStore(s => s.message);
  const hide = useToastStore(s => s.hide);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!message) return;
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
    anim.start(({ finished }) => { if (finished) hide(); });
    return () => anim.stop();
  }, [message, hide, opacity, translateY]);

  if (!message) return null;

  return (
    <View style={[s.wrap, { bottom: insets.bottom + 84 }]} pointerEvents="none">
      <Animated.View style={[s.pill, { opacity, transform: [{ translateY }] }]}>
        <Text style={s.text} numberOfLines={2}>{message}</Text>
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
    maxWidth: '86%',
    backgroundColor: 'rgba(34,34,34,0.92)',
    paddingHorizontal: Spacing[20],
    paddingVertical: 12,
    borderRadius: Radius.round,
  },
  text: {
    ...Typography.body.m,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
