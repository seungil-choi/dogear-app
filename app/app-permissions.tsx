/**
 * 앱 권한 화면
 *
 * 진입: 내 정보 > 설정 > 앱 권한
 * 알림·위치 OS 권한 상태 확인/변경. (약관 및 정책 화면에서 분리 — 성격이 다른 항목)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Linking, Switch, Platform, AppState,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { notify } from '../src/utils/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import type { IconName } from '../src/components/common/Icon';

function PermRow({
  icon, label, value, onPress, rightEl,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  rightEl?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      disabled={!onPress && !rightEl}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={s.rowIconWrap}>
        <Icon name={icon} size={18} color={Colors.text.secondary} />
      </View>
      <Text style={s.rowLabel}>{label}</Text>
      {value && <Text style={s.rowValue}>{value}</Text>}
      {rightEl ?? (onPress && (
        <Icon name="forward" size={16} color={Colors.text.tertiary} />
      ))}
    </TouchableOpacity>
  );
}

export default function AppPermissionsScreen() {
  const router = useRouter();

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [locStatus, setLocStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  const syncPermissions = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifEnabled(window.Notification.permission === 'granted');
      }
      return;
    }
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotifEnabled(status === 'granted');
    } catch {
      setNotifEnabled(false);
    }
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocStatus(status as any);
    } catch {
      setLocStatus('denied');
    }
  }, []);

  // 마운트 시 + 백그라운드→포그라운드 복귀 시(OS 설정 변경 반영) 동기화
  useEffect(() => {
    syncPermissions();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncPermissions();
    });
    return () => sub.remove();
  }, [syncPermissions]);

  const handleNotifToggle = useCallback(async (next: boolean) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        notify('이 브라우저는 알림을 지원하지 않아요.', '알림 미지원');
        return;
      }
      if (next) {
        const result = await window.Notification.requestPermission();
        setNotifEnabled(result === 'granted');
        if (result !== 'granted') {
          notify('브라우저 사이트 설정에서 알림을 허용해주세요.', '알림 권한');
        }
      } else {
        notify('알림 해제는 브라우저 사이트 설정에서 변경할 수 있어요.', '알림 권한');
      }
      return;
    }

    if (next) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotifEnabled(true);
      } else {
        // OS가 다이얼로그를 차단한 상태 → 설정으로 안내
        notify('설정에서 DogEar의 알림을 허용해주세요.', '알림 권한 필요');
        Linking.openSettings().catch(() => {});
      }
    } else {
      // 앱이 OS 권한을 직접 해제할 수 없음 → 설정으로 안내
      notify('알림 해제는 시스템 설정에서 변경할 수 있어요.', '알림 권한');
      Linking.openSettings().catch(() => {});
    }
  }, []);

  const locLabel =
    locStatus === 'granted' ? '사용 중' :
    locStatus === 'denied'  ? '거부됨'  : '미설정';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>앱 권한</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <PermRow
            icon="bell"
            label="알림 권한"
            rightEl={
              <Switch
                value={notifEnabled}
                onValueChange={handleNotifToggle}
                trackColor={{ false: Colors.border.default, true: Colors.brand.primaryLight }}
                thumbColor={notifEnabled ? Colors.brand.primary : Colors.bg.secondary}
                accessibilityLabel="알림 권한"
              />
            }
          />
          <View style={s.divider} />
          <PermRow
            icon="location"
            label="위치 권한"
            value={locLabel}
            onPress={() => Linking.openSettings()}
          />
        </View>

        <Text style={s.note}>
          권한은 기기 설정에서 언제든 변경할 수 있어요.{'\n'}
          위치를 거부해도 지도를 직접 옮겨 장소를 둘러볼 수 있어요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg.secondary },
  scroll:  { flex: 1 },
  content: { paddingTop: Spacing[24], paddingBottom: 40 },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    ...Typography.title.m, color: Colors.text.primary,
  },

  card: {
    marginHorizontal: Spacing[16],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  divider: { height: 1, backgroundColor: Colors.border.subtle, marginLeft: Spacing[16] + 28 + Spacing[12] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[16],
    gap: Spacing[12],
  },
  rowIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  rowValue: { ...Typography.body.s, color: Colors.text.tertiary },

  note: {
    ...Typography.body.s, color: Colors.text.tertiary,
    lineHeight: 20, textAlign: 'center', marginTop: Spacing[24],
    paddingHorizontal: Spacing[24],
  },
});
