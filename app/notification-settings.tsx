/**
 * 알림 설정 화면
 *
 * 진입: 내 정보 > 설정 > 알림 설정
 * - "푸시 알림 받기" 마스터 토글 (실제 동작)
 *    ON  → OS 권한 확인 → 허용 시 현재 기기 토큰 등록, 미허용 시 시스템 설정 안내
 *    OFF → 서버에서 이 사용자 푸시 토큰 삭제 (발송 자체를 차단)
 * - OS 알림이 꺼져 있으면 안내 + 시스템 설정 열기
 *
 * (수신 알림함은 홈 상단 종 아이콘에서 확인 — 이 화면은 '설정'만 담당)
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import { unregisterPushTokens, registerPushTokenNow } from '../src/hooks/usePushToken';

export default function NotificationSettingsScreen() {
  const router      = useRouter();
  const user        = useAppStore(s => s.user);
  const pushEnabled = useAppStore(s => s.pushEnabled);
  const setPushEnabled = useAppStore(s => s.setPushEnabled);

  const [osGranted, setOsGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshOsStatus = async () => {
    if (Platform.OS === 'web') { setOsGranted(false); return; }
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setOsGranted(status === 'granted');
    } catch {
      setOsGranted(false);
    }
  };

  useEffect(() => { refreshOsStatus(); }, []);

  const handleToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        // 켜기 — OS 권한 확인 후 없으면 요청
        let granted = false;
        if (Platform.OS !== 'web') {
          let { status } = await Notifications.getPermissionsAsync();
          if (status === 'undetermined') {
            status = (await Notifications.requestPermissionsAsync()).status;
          }
          granted = status === 'granted';
          setOsGranted(granted);
        }
        setPushEnabled(true);
        if (granted && user?.user_id) {
          await registerPushTokenNow(user.user_id);
        }
      } else {
        // 끄기 — 서버 토큰 삭제로 발송 차단
        setPushEnabled(false);
        if (user?.user_id) {
          await unregisterPushTokens(user.user_id);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const osDisabled = pushEnabled && osGranted === false;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>알림 설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* 마스터 토글 */}
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowIcon}>
              <Icon name="bell" size={18} color={Colors.brand.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>푸시 알림 받기</Text>
              <Text style={s.rowDesc}>발도장 소식과 익숙한 강아지 알림을 받아요.</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={handleToggle}
              disabled={busy}
              trackColor={{ false: Colors.border.strong, true: Colors.brand.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* OS 알림 꺼짐 안내 */}
        {osDisabled && (
          <TouchableOpacity
            style={s.notice}
            activeOpacity={0.85}
            onPress={() => Linking.openSettings().catch(() => {})}
          >
            <Icon name="warning" size={16} color={Colors.brand.accent} />
            <Text style={s.noticeText}>
              기기 알림이 꺼져 있어 알림이 오지 않아요. 시스템 설정에서 DogEar 알림을 켜주세요.
            </Text>
            <Icon name="forward" size={14} color={Colors.brand.accent} />
          </TouchableOpacity>
        )}

        <Text style={s.footNote}>
          알림을 끄면 이 기기로 더 이상 푸시가 오지 않아요. 받은 알림은 홈 화면 상단의 종 아이콘에서 언제든 확인할 수 있어요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20], gap: Spacing[16] },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  card: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    borderWidth: 1, borderColor: Colors.border.default,
    padding: Spacing[16],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[12] },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { ...Typography.body.l, color: Colors.text.primary, fontWeight: '700' },
  rowDesc:  { ...Typography.body.s, color: Colors.text.tertiary, marginTop: 2 },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[10],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.l, borderWidth: 1, borderColor: Colors.border.brand,
    padding: Spacing[14],
  },
  noticeText: { flex: 1, ...Typography.body.s, color: Colors.brand.accent, lineHeight: 20 },

  footNote: { ...Typography.body.s, color: Colors.text.tertiary, lineHeight: 20, paddingHorizontal: Spacing[4] },
});
