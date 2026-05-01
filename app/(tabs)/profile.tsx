/**
 * 마이 탭
 *
 * 역할: 여러 반려견 프로필과 서비스 설정을 관리
 *
 * 구조:
 *   1) 내 반려견 — 전체 목록, 활성 강아지 전환, 강아지 추가
 *   2) 발도장 설정 — 활성 강아지 기준 공개 범위 / 안전 설정
 *   3) 앱 설정 — 알림, 약관, 개인정보
 *   4) 로그아웃
 */

import React, { useCallback } from 'react';
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
import type { Dog } from '../../src/types';

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

// ─── 강아지 카드 ─────────────────────────────────────────────────
const MAX_DOGS = 5;

function DogCard({
  dog,
  isActive,
  onActivate,
  onEdit,
}: {
  dog: Dog;
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.dogCard, isActive && s.dogCardActive]}
      onPress={isActive ? undefined : onActivate}
      activeOpacity={isActive ? 1 : 0.75}
    >
      {/* 아바타 */}
      <View style={[s.dogAvatarWrap, isActive && s.dogAvatarWrapActive]}>
        {dog.avatar_url ? (
          <Image
            source={{ uri: dog.avatar_url }}
            style={s.dogAvatarImg}
            resizeMode="cover"
          />
        ) : (
          <View style={s.dogAvatarPlaceholder}>
            <Text style={s.dogAvatarInitial}>{dog.name[0]}</Text>
          </View>
        )}
      </View>

      {/* 정보 영역 */}
      <View style={s.dogInfo}>
        {/* 이름 + 활성 배지 */}
        <View style={s.dogNameRow}>
          <Text style={[s.dogName, isActive && s.dogNameActive]}>{dog.name}</Text>
          {isActive && (
            <View style={s.activeBadge}>
              <Icon name="paw-filled" size={10} color={Colors.brand.primary} />
              <Text style={s.activeBadgeText}>발도장 활성 중</Text>
            </View>
          )}
        </View>

        {/* 견종 · 나이 */}
        <Text style={s.dogSub}>
          {dog.breed ? `${dog.breed} · ` : ''}{sizeLabel[dog.size]} · {ageGroupLabel[dog.age_group]}
        </Text>

        {/* 성향 태그 */}
        {dog.temperament_tags.length > 0 && (
          <View style={s.tagRow}>
            {dog.temperament_tags.slice(0, 2).map(t => (
              <View key={t} style={[s.tag, isActive && s.tagActive]}>
                <Text style={[s.tagText, isActive && s.tagTextActive]}>
                  {temperamentLabels[t] ?? t}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 비활성 안내 */}
        {!isActive && (
          <Text style={s.switchHint}>탭하여 활성으로 변경</Text>
        )}
      </View>

      {/* 편집 버튼 */}
      <TouchableOpacity
        style={s.dogEditBtn}
        onPress={onEdit}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`${dog.name} 프로필 수정`}
      >
        <Icon name="settings" size={17} color={Colors.text.tertiary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router               = useRouter();
  const activeDog            = useAppStore(s => s.activeDog);
  const dogs                 = useAppStore(s => s.dogs);
  const setActiveDog         = useAppStore(s => s.setActiveDog);
  const privacySetting       = useAppStore(s => s.privacySetting);
  const updatePrivacySetting = useAppStore(s => s.updatePrivacySetting);
  const logout               = useAppStore(s => s.logout);

  const handleActivate = useCallback((dog: Dog) => {
    setActiveDog(dog);
  }, [setActiveDog]);

  const handleEdit = useCallback((dog: Dog) => {
    // dog-edit은 activeDog 기준으로 동작 — 해당 강아지를 활성으로 전환 후 이동
    setActiveDog(dog);
    router.push('/dog-edit');
  }, [setActiveDog, router]);

  const handleAddDog = useCallback(() => {
    router.push('/(auth)/dog-setup' as any);
  }, [router]);

  // 강아지 없음 → 온보딩 유도
  if (!activeDog || dogs.length === 0) {
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
  const visibilityText    = visibilityLabel[currentVisibility] ?? currentVisibility;
  const canAddMore        = dogs.length < MAX_DOGS;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════
            1) 내 반려견
        ══════════════════════════════════════ */}
        <View style={s.section}>
          {/* 섹션 헤더 */}
          <View style={s.sectionHeader}>
            <View style={s.sectionTitleRow}>
              <Icon name="paw" size={15} color={Colors.text.secondary} />
              <Text style={s.sectionTitle}>내 반려견</Text>
            </View>
            {canAddMore && (
              <TouchableOpacity
                style={s.addDogBtn}
                onPress={handleAddDog}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="plus" size={14} color={Colors.brand.primary} />
                <Text style={s.addDogText}>강아지 추가</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 강아지 카드 목록 */}
          <View style={s.dogList}>
            {dogs.map(dog => (
              <DogCard
                key={dog.dog_id}
                dog={dog}
                isActive={dog.dog_id === activeDog.dog_id}
                onActivate={() => handleActivate(dog)}
                onEdit={() => handleEdit(dog)}
              />
            ))}
          </View>

          {/* 최대 도달 안내 */}
          {!canAddMore && (
            <Text style={s.maxDogsHint}>최대 {MAX_DOGS}마리까지 등록할 수 있어요</Text>
          )}
        </View>

        {/* ══════════════════════════════════════
            2) 발도장 설정 (활성 강아지 기준)
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="lock" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>
              발도장 설정
              <Text style={s.sectionTitleSub}> · {activeDog.name}</Text>
            </Text>
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

        {/* ══════════════════════════════════════
            3) 앱 설정
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="settings" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>설정</Text>
          </View>
          <View style={s.settingsCard}>
            <SettingsRow icon="bell"     label="알림"             onPress={() => router.push('/notifications')} />
            <SettingsRow icon="settings" label="앱 설정"          onPress={() => router.push('/settings' as any)} />
            <SettingsRow icon="document" label="서비스 이용약관"  onPress={() => router.push('/(legal)/terms' as any)} />
            <SettingsRow icon="shield"   label="개인정보 처리방침" onPress={() => router.push('/(legal)/privacy-policy' as any)} />
          </View>
        </View>

        {/* ══════════════════════════════════════
            4) 로그아웃
        ══════════════════════════════════════ */}
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

// ─── 스타일 ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:  { flex: 1 },
  content: { paddingTop: Spacing[16], paddingBottom: Spacing[24] },

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

  // 섹션
  section: {
    marginHorizontal: Spacing[16],
    marginBottom: Spacing[24],
    gap: Spacing[10],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
    paddingHorizontal: Spacing[4],
  },
  sectionTitle: {
    ...Typography.label.m,
    color: Colors.text.tertiary,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sectionTitleSub: {
    ...Typography.label.m,
    color: Colors.brand.accent,
    fontWeight: '600',
    letterSpacing: 0,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    lineHeight: 18,
    paddingHorizontal: Spacing[4],
  },

  // + 강아지 추가 버튼
  addDogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.subtle,
    borderWidth: 1,
    borderColor: Colors.border.brand,
  },
  addDogText: {
    ...Typography.label.s,
    color: Colors.brand.primary,
    fontWeight: '600',
  },

  // 강아지 카드 목록
  dogList: {
    gap: Spacing[8],
  },

  // 강아지 카드
  dogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    padding: Spacing[16],
    gap: Spacing[14],
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  dogCardActive: {
    backgroundColor: Colors.brand.subtle,
    borderColor: Colors.border.brand,
  },

  // 아바타
  dogAvatarWrap: {
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    borderWidth: 2,
    borderColor: Colors.border.default,
  },
  dogAvatarWrapActive: {
    borderColor: Colors.border.brand,
  },
  dogAvatarImg: { width: '100%', height: '100%' },
  dogAvatarPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogAvatarInitial: {
    ...Typography.title.m,
    color: Colors.brand.accent,
    fontWeight: '700',
  },

  // 강아지 정보
  dogInfo: { flex: 1, gap: Spacing[4] },
  dogNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
    flexWrap: 'wrap',
  },
  dogName: {
    ...Typography.title.s,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  dogNameActive: {
    color: Colors.brand.accent,
  },
  dogSub: {
    ...Typography.body.s,
    color: Colors.text.tertiary,
  },

  // 활성 배지
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.brand.primary,
    fontWeight: '700',
  },

  // 성향 태그
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6], marginTop: Spacing[2] },
  tag: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  tagActive: {
    backgroundColor: 'transparent',
    borderColor: Colors.border.brand,
  },
  tagText:  { ...Typography.label.s, color: Colors.text.secondary },
  tagTextActive: { color: Colors.brand.accent },

  // 비활성 전환 힌트
  switchHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: Spacing[2],
  },

  // 편집 버튼
  dogEditBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    flexShrink: 0,
  },

  // 최대 마리 수 안내
  maxDogsHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing[4],
  },

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
  settingsLabel:  { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  settingsDanger: { color: Colors.status.error.text },
  settingsValue:  {
    ...Typography.body.s,
    color: Colors.text.tertiary,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '45%',
  },
});
