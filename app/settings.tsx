/**
 * 앱 설정 화면
 *
 * profile.tsx의 "설정" 섹션에서 진입.
 * 알림 설정 / 위치 권한 / 고객센터 / 개인정보 처리방침 / 로그아웃 / 계정 삭제
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Linking, Switch, Platform, AppState,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { notify } from '../src/utils/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import type { IconName } from '../src/components/common/Icon';

// ─── 설정 행 ─────────────────────────────────────────────
function SettingsRow({
  icon, label, value, onPress, danger, rightEl,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
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
        <Icon
          name={icon}
          size={18}
          color={danger ? Colors.status.error.text : Colors.text.secondary}
        />
      </View>
      <Text style={[s.rowLabel, danger && s.rowDanger]}>{label}</Text>
      {value && <Text style={s.rowValue}>{value}</Text>}
      {rightEl ?? (onPress && !danger && (
        <Icon name="forward" size={16} color={Colors.text.tertiary} />
      ))}
    </TouchableOpacity>
  );
}

// ─── 섹션 구분 타이틀 ─────────────────────────────────────
function SectionTitle({ label }: { label: string }) {
  return <Text style={s.sectionTitle}>{label}</Text>;
}

// ─── 메인 컴포넌트 ───────────────────────────────────────
export default function SettingsScreen() {
  const router  = useRouter();

  // 알림 권한 — OS 권한 상태와 실시간 동기화
  //   ON 시도: 권한 요청 → 거부되어 있으면 설정 안내
  //   OFF 시도: OS에서 앱이 권한을 직접 끌 수 없으므로 설정으로 안내
  const [notifEnabled, setNotifEnabled] = useState(false);

  const syncNotifPermission = useCallback(async () => {
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
  }, []);

  // 마운트 시 + 백그라운드→포그라운드 복귀 시(OS 설정 변경 반영) 동기화
  useEffect(() => {
    syncNotifPermission();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') syncNotifPermission();
    });
    return () => sub.remove();
  }, [syncNotifPermission]);

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

  const handleDeleteAccount = () => {
    router.push('/account-delete');
  };

  const openSupport = () => {
    Linking.openURL('mailto:support@9factorial.com?subject=DogEar%20%EB%AC%B8%EC%9D%98')
      .catch(() => notify('support@9factorial.com으로 직접 문의해 주세요.', '메일 앱을 열 수 없어요'));
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ──────────────────────────────────────────
            1) 권한 — 시스템 권한 (알림 OS 설정 + 위치)
              알림 자체는 마이의 활동 섹션에서 관리, 여기는 OS 권한 토글
        ────────────────────────────────────────── */}
        <SectionTitle label="권한" />
        <View style={s.card}>
          <SettingsRow
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
          <SettingsRow
            icon="location"
            label="위치 권한"
            value="사용 중"
            onPress={() => Linking.openSettings()}
          />
        </View>

        {/* ──────────────────────────────────────────
            2) 약관 및 정책 — 한 번 보고 마는 항목들
        ────────────────────────────────────────── */}
        <SectionTitle label="약관 및 정책" />
        <View style={s.card}>
          <SettingsRow icon="document" label="서비스 이용약관"        onPress={() => router.push('/(legal)/terms')} />
          <View style={s.divider} />
          <SettingsRow icon="shield"   label="개인정보 처리방침"      onPress={() => router.push('/(legal)/privacy-policy')} />
          <View style={s.divider} />
          <SettingsRow icon="document" label="위치기반서비스 이용약관" onPress={() => router.push('/(legal)/location-terms')} />
        </View>

        {/* ──────────────────────────────────────────
            3) 도움말
        ────────────────────────────────────────── */}
        <SectionTitle label="도움말" />
        <View style={s.card}>
          <SettingsRow icon="help" label="고객센터 문의" onPress={openSupport} />
        </View>

        {/* ──────────────────────────────────────────
            4) 계정 관리 — 회원 탈퇴 등 드물지만 시스템 영역
              로그아웃은 마이 탭 직관 노출 (중복 제거)
        ────────────────────────────────────────── */}
        <SectionTitle label="계정 관리" />
        <View style={s.card}>
          <SettingsRow icon="person" label="계정 관리 / 회원 탈퇴" onPress={handleDeleteAccount} />
        </View>

        {/* 앱 버전 */}
        <Text style={s.version}>버전 1.0.0 (MVP)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 스타일 ─────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg.secondary },
  scroll:  { flex: 1 },
  content: { paddingBottom: 40 },

  // 헤더
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

  // 섹션 타이틀
  sectionTitle: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    fontWeight: '600',
    letterSpacing: 0.3,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[24],
    paddingBottom: Spacing[8],
    marginHorizontal: Spacing[16],
  },

  // 카드
  card: {
    marginHorizontal: Spacing[16],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  divider: { height: 1, backgroundColor: Colors.border.subtle, marginLeft: Spacing[16] + 28 + Spacing[12] },

  // 행
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
  rowLabel:   { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  rowDanger:  { color: Colors.status.error.text },
  rowValue:   { ...Typography.body.s, color: Colors.text.tertiary },

  // 버전
  version: {
    ...Typography.caption, color: Colors.text.tertiary,
    textAlign: 'center', marginTop: Spacing[32],
  },
});
