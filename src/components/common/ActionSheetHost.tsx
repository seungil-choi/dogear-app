/**
 * 액션 시트 — 앱 루트에 한 번만 마운트한다.
 *
 * 왜 직접 만들었나:
 *   예전에는 actionSheet()가 OS의 Alert.alert에 버튼을 나열했는데,
 *   **안드로이드 AlertDialog는 버튼을 3개(positive/negative/neutral)까지만 받는다.**
 *   장소 상세의 ⋯ 메뉴는 액션 3개 + 취소 = 4개라 초과분이 잘려나갔고,
 *   하필 잘린 게 '취소'라 열면 닫을 수 없는 상태가 됐다.
 *   OS 다이얼로그로는 항목 수를 늘릴 수 없으므로 자체 레이어로 옮긴다.
 *
 * 닫는 경로를 셋 둔다 — 하나가 막혀도 갇히지 않게:
 *   1) 취소 버튼  2) 배경(딤) 탭  3) 안드로이드 뒤로가기
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, BackHandler, Modal, Platform, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionSheetStore } from '../../utils/dialog';
import { Colors, Typography, Radius, Spacing } from '../../constants/tokens';

export function ActionSheetHost() {
  const req = useActionSheetStore(s => s.request);
  const resolve = useActionSheetStore(s => s.resolve);
  const insets = useSafeAreaInsets();

  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(1)).current;   // 1 = 화면 아래(숨김)

  // 닫히는 동안 그릴 스냅샷.
  //   선택 결과는 **탭 즉시** 확정하고(=스토어에서 요청 제거), 화면만 이 스냅샷으로
  //   마저 애니메이션한다. 예전처럼 애니메이션이 끝난 뒤 확정하면,
  //   그 160ms 사이에 다른 시트가 열릴 때 이전 선택이 취소(-1)로 뒤집혔다.
  const [exiting, setExiting] = useState<typeof req>(null);
  const shown = req ?? exiting;

  useEffect(() => {
    if (!req) return;
    setExiting(null);
    backdrop.setValue(0);
    slide.setValue(1);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 11, tension: 70 }),
    ]).start();
  }, [req, backdrop, slide]);

  const close = useCallback((index: number) => {
    const target = useActionSheetStore.getState().request;
    if (!target) return;
    resolve(target, index);   // ① 결과부터 확정 — 타이밍에 좌우되지 않는다
    setExiting(target);       // ② 화면은 스냅샷으로 마저 닫는다
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setExiting(null); });
  }, [backdrop, slide, resolve]);

  // 안드로이드 뒤로가기 — Modal의 onRequestClose로도 오지만, 이중으로 막아둔다
  useEffect(() => {
    if (!req || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(-1); return true; });
    return () => sub.remove();
  }, [req, close]);

  if (!shown) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => close(-1)}
    >
      {/* accessibilityViewIsModal: 스크린리더가 시트 뒤 화면을 계속 읽지 않도록 가둔다 */}
      <View style={s.root} accessibilityViewIsModal>
        {/* 딤 — 탭하면 닫힌다 */}
        <Animated.View style={[StyleSheet.absoluteFill, s.dim, { opacity: backdrop }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close(-1)}
            accessibilityLabel="닫기"
          />
        </Animated.View>

        <Animated.View
          style={[s.sheet, { transform: [{ translateY }], paddingBottom: insets.bottom + Spacing[12] }]}
        >
          <View style={s.grabber} />

          {!!shown.title && (
            <Text style={s.title} numberOfLines={2}>{shown.title}</Text>
          )}

          <View style={s.list}>
            {shown.actions.map((a, i) => (
              <React.Fragment key={`${a.label}-${i}`}>
                {i > 0 && <View style={s.divider} />}
                <Pressable
                  style={({ pressed }) => [s.item, pressed && s.itemPressed]}
                  onPress={() => close(i)}
                  accessibilityRole="button"
                >
                  <Text style={[s.itemText, a.destructive && s.itemTextDanger]}>{a.label}</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [s.cancel, pressed && s.itemPressed]}
            onPress={() => close(-1)}
            accessibilityRole="button"
          >
            <Text style={s.cancelText}>{shown.cancelText}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(18,12,6,0.42)' },

  sheet: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing[12],
    paddingTop: Spacing[8],
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border.strong,
    alignSelf: 'center',
    marginBottom: Spacing[12],
  },
  title: {
    ...Typography.label.m,
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing[16],
    paddingBottom: Spacing[10],
  },

  list: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: Spacing[16],
    paddingHorizontal: Spacing[16],
    alignItems: 'center',
    // 44pt 이상 확보 — 손가락 타깃
    minHeight: 52,
    justifyContent: 'center',
  },
  itemPressed: { backgroundColor: Colors.bg.tertiary },
  itemText: { ...Typography.body.m, color: Colors.text.primary, fontWeight: '500' },
  itemTextDanger: { color: Colors.status.error.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border.default },

  cancel: {
    marginTop: Spacing[8],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { ...Typography.body.m, color: Colors.text.secondary, fontWeight: '700' },
});
