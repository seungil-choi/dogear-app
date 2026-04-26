/**
 * 앱 설정 화면
 *
 * profile.tsx의 "설정" 섹션에서 진입.
 * 알림 설정 / 위치 권한 / 고객센터 / 개인정보 처리방침 / 로그아웃 / 계정 삭제
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Linking, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
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
  const logout  = useAppStore(st => st.logout);

  // 알림 on/off (로컬 상태 — 실제 권한 연동은 추후)
  const [notifEnabled, setNotifEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => { logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const handleDeleteAccount = () => {
    router.push('/account-delete' as any);
  };

  const openSupport = () => {
    Linking.openURL('mailto:support@9factorial.com?subject=DogEar%20%EB%AC%B8%EC%9D%98')
      .catch(() => Alert.alert('메일 앱을 열 수 없어요', 'support@9factorial.com으로 직접 문의해 주세요.'));
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
        {/* ── 알림 / 위치 ── */}
        <SectionTitle label="권한" />
        <View style={s.card}>
          <SettingsRow
            icon="bell"
            label="알림"
            rightEl={
              <Switch
                value={notifEnabled}
                onValueChange={setNotifEnabled}
                trackColor={{ false: Colors.border.default, true: Colors.brand.primaryLight }}
                thumbColor={notifEnabled ? Colors.brand.primary : Colors.bg.secondary}
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

        {/* ── 고객지원 ── */}
        <SectionTitle label="고객지원" />
        <View style={s.card}>
          <SettingsRow icon="help"     label="고객센터"             onPress={openSupport} />
          <View style={s.divider} />
          <SettingsRow icon="document" label="개인정보 처리방침"     onPress={() => router.push('/(legal)/privacy-policy' as any)} />
          <View style={s.divider} />
          <SettingsRow icon="document" label="서비스 이용약관"       onPress={() => router.push('/(legal)/terms' as any)} />
          <View style={s.divider} />
          <SettingsRow icon="document" label="위치기반서비스 이용약관" onPress={() => router.push('/(legal)/location-terms' as any)} />
        </View>

        {/* ── 안전 / 모더레이션 ── */}
        <SectionTitle label="안전" />
        <View style={s.card}>
          <SettingsRow icon="person" label="차단한 사용자" onPress={() => router.push('/blocked-users' as any)} />
        </View>

        {/* ── 계정 ── */}
        <SectionTitle label="계정" />
        <View style={s.card}>
          <SettingsRow icon="logout"  label="로그아웃"  onPress={handleLogout} />
          <View style={s.divider} />
          <SettingsRow icon="warning" label="계정 삭제" onPress={handleDeleteAccount} danger />
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
    borderRadius: Radius.l,
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
  rowIconWrap: { width: 28, alignItems: 'center' },
  rowLabel:   { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  rowDanger:  { color: Colors.status.error.text },
  rowValue:   { ...Typography.body.s, color: Colors.text.tertiary },

  // 버전
  version: {
    ...Typography.caption, color: Colors.text.tertiary,
    textAlign: 'center', marginTop: Spacing[32],
  },
});
