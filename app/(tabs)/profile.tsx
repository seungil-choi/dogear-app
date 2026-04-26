/**
 * 마이 탭
 *
 * 역할: 반려견 정보와 노출/안전/부가 설정을 관리
 * 핵심 질문: "우리 아이 정보와 서비스 노출/설정을 어디서 관리하지?"
 *
 * 구조:
 *   1) 반려견 프로필 (컴팩트) — 사진 + 이름 + 기본 요약 + 수정 버튼
 *   2) 공개 범위 / 안전 설정 — 자주 찾는 강아지 노출, 사진/기록 노출
 *   3) 반려견 관리 — 정보 수정, 성향/산책 스타일 수정
 *   4) 부가 설정 — 알림, 위치, 도움말, 약관, 로그아웃
 */

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, SafeAreaView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Button } from '../../src/components/common/Button';
import { Icon, type IconName } from '../../src/components/common/Icon';
import { sizeLabel, ageGroupLabel, visibilityLabel, temperamentLabels } from '../../src/utils/labels';

// ─── 설정 행 ─────────────────────────────────────────────────────
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
      style={s.settingsRow}
      onPress={onPress}
      disabled={!onPress && !rightEl}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[s.settingsIconWrap, danger && s.settingsIconWrapDanger]}>
        <Icon name={icon} size={17} color={danger ? Colors.status.error.text : Colors.text.secondary} />
      </View>
      <Text style={[s.settingsLabel, danger && s.settingsDanger]} numberOfLines={1}>{label}</Text>
      {value  && <Text style={s.settingsValue}>{value}</Text>}
      {rightEl ?? (onPress && <Icon name="forward" size={16} color={Colors.text.tertiary} />)}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router             = useRouter();
  const dog                = useAppStore(s => s.dog);
  const privacySetting     = useAppStore(s => s.privacySetting);
  const updatePrivacySetting = useAppStore(s => s.updatePrivacySetting);
  const logout             = useAppStore(s => s.logout);

  // 강아지 없음 → 온보딩 유도
  if (!dog) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loginPrompt}>
          <View style={s.loginIconWrap}>
            <Icon name="dog" size={48} color={Colors.brand.primary} />
          </View>
          <Text style={s.loginTitle}>반려견 프로필을 만들어주세요</Text>
          <Button
            label="시작하기"
            onPress={() => router.push('/(auth)/onboarding')}
            variant="primary"
            size="l"
          />
        </View>
      </SafeAreaView>
    );
  }

  const currentVisibility = privacySetting.default_visibility_level;
  const visibilityText = visibilityLabel[currentVisibility] ?? currentVisibility;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1) 반려견 프로필 컴팩트 카드 ── */}
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            {dog.avatar_url ? (
              <Image
                source={{ uri: dog.avatar_url }}
                style={{ width: 60, height: 60, borderRadius: 30 }}
                resizeMode="cover"
              />
            ) : (
              <Icon name="dog" size={32} color={Colors.brand.primary} />
            )}
          </View>
          <View style={s.profileInfo}>
            <Text style={s.dogName}>{dog.name}</Text>
            <Text style={s.dogSub}>
              {sizeLabel[dog.size]} · {ageGroupLabel[dog.age_group]}
            </Text>
            {dog.temperament_tags.length > 0 && (
              <View style={s.tagRow}>
                {dog.temperament_tags.slice(0, 3).map(t => (
                  <View key={t} style={s.tag}>
                    <Text style={s.tagText}>{temperamentLabels[t] ?? t}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <TouchableOpacity
            style={s.editBtn}
            onPress={() => router.push('/dog-edit')}
            accessibilityLabel="프로필 수정"
            accessibilityRole="button"
          >
            <Icon name="settings" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* ── 2) 공개 범위 / 안전 설정 ── */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="lock" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>공개 범위 · 안전 설정</Text>
          </View>
          <View style={s.settingsCard}>
            <SettingsRow
              icon="lock"
              label="발도장 공개 범위"
              value={visibilityText}
              onPress={() => router.push('/privacy-settings')}
            />
            <SettingsRow
              icon="person"
              label="자주 만나는 강아지에게 보이기"
              rightEl={
                <Switch
                  value={privacySetting.allow_familiar_layer_exposure}
                  onValueChange={v => updatePrivacySetting({ allow_familiar_layer_exposure: v })}
                  trackColor={{ false: Colors.border.default, true: Colors.brand.primaryLight }}
                  thumbColor={
                    privacySetting.allow_familiar_layer_exposure
                      ? Colors.brand.primary
                      : Colors.bg.secondary
                  }
                />
              }
            />
          </View>
          <Text style={s.sectionHint}>
            6가지 안전 조건을 모두 충족해야 다른 강아지에게 보여져요
          </Text>
        </View>

        {/* ── 3) 반려견 관리 ── */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="paw" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>반려견 관리</Text>
          </View>
          <View style={s.settingsCard}>
            <SettingsRow icon="paw"      label="기본 정보 수정"     onPress={() => router.push('/dog-edit')} />
            <SettingsRow icon="flag"     label="성향 · 산책 스타일" onPress={() => router.push('/dog-edit')} />
          </View>
        </View>

        {/* ── 4) 부가 설정 ── */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="settings" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>설정</Text>
          </View>
          <View style={s.settingsCard}>
            <SettingsRow icon="bell"     label="알림"      onPress={() => router.push('/notifications')} />
            <SettingsRow icon="settings" label="앱 설정"   onPress={() => router.push('/settings' as any)} />
            <SettingsRow icon="document" label="서비스 이용약관"    onPress={() => router.push('/(legal)/terms' as any)} />
            <SettingsRow icon="shield"   label="개인정보 처리방침" onPress={() => router.push('/(legal)/privacy-policy' as any)} />
          </View>
        </View>

        {/* ── 5) 로그아웃 ── */}
        <View style={s.section}>
          <View style={s.settingsCard}>
            <SettingsRow
              icon="logout"
              label="로그아웃"
              onPress={logout}
              danger
            />
          </View>
        </View>

        <View style={{ height: Spacing[16] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:  { flex: 1 },
  content: { paddingBottom: 24 },

  // 로그인 유도
  loginPrompt: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing[32], gap: Spacing[16],
  },
  loginIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  loginTitle: { ...Typography.title.m, color: Colors.text.primary, textAlign: 'center' },

  // 프로필 카드 (컴팩트, 가로 배치)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing[16],
    marginTop: Spacing[24],
    marginBottom: Spacing[8],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    padding: Spacing[20],
    gap: Spacing[16],
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
  },
  avatarWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  profileInfo: { flex: 1, gap: Spacing[6] },
  dogName:     { ...Typography.title.m, color: Colors.text.primary },
  dogSub:      { ...Typography.body.s, color: Colors.text.tertiary },
  tagRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6], marginTop: 2 },
  tag: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[10], paddingVertical: Spacing[4],
    borderRadius: Radius.round,
  },
  tagText:  { ...Typography.label.s, color: Colors.text.secondary },
  editBtn:  {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
  },

  // 섹션
  section: {
    marginHorizontal: Spacing[16],
    marginBottom: Spacing[24],
    gap: Spacing[8],
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6], paddingHorizontal: Spacing[4] },
  sectionTitle:    { ...Typography.label.m, color: Colors.text.tertiary, fontWeight: '600', letterSpacing: 0.3 },
  sectionHint:     { ...Typography.caption, color: Colors.text.tertiary, lineHeight: 18, paddingHorizontal: Spacing[4] },

  // 설정 카드
  settingsCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[14],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.default,
    gap: Spacing[12],
  },
  settingsIconWrap: {
    width: 32, height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconWrapDanger: {
    backgroundColor: Colors.status.error.bg,
  },
  settingsLabel:    { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  settingsDanger:   { color: Colors.status.error.text },
  settingsValue:    { ...Typography.body.s, color: Colors.text.tertiary, flexShrink: 1, textAlign: 'right', maxWidth: '45%' },
});
