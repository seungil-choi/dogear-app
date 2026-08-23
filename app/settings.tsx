/**
 * 약관 및 정책 화면
 *
 * profile.tsx의 "설정" 섹션에서 진입.
 * 서비스 이용약관 / 개인정보 처리방침 / 위치기반서비스 이용약관
 * (OS 권한은 별도 "앱 권한" 화면(app-permissions)으로 분리)
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
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

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>약관 및 정책</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 약관 및 정책 — OS 권한은 "앱 권한" 화면으로 분리됨 */}
        <SectionTitle label="약관 및 정책" />
        <View style={s.card}>
          <SettingsRow icon="document" label="서비스 이용약관"        onPress={() => router.push('/(legal)/terms')} />
          <View style={s.divider} />
          <SettingsRow icon="shield"   label="개인정보 처리방침"      onPress={() => router.push('/(legal)/privacy-policy')} />
          <View style={s.divider} />
          <SettingsRow icon="document" label="위치기반서비스 이용약관" onPress={() => router.push('/(legal)/location-terms')} />
        </View>

        {/* 도움말·계정 관리는 내 정보 화면으로 이동(중복 제거) */}

        {/* 자가진단 — 기기에서 서버·인증·계측·데이터 상태를 직접 점검 */}
        <SectionTitle label="문제 해결" />
        <View style={s.card}>
          {/* as any — expo-router 타입 라우트는 자동 생성물이라 새 화면은 빌드 후 반영된다(기존 화면들과 동일 처리) */}
          <SettingsRow icon="warning" label="연결 확인" onPress={() => router.push('/self-check' as any)} />
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
