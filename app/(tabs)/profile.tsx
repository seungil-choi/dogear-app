/**
 * 마이 탭
 *
 * 역할: 여러 강아지 프로필과 서비스 설정을 관리
 *
 * 구조:
 *   1) 내 강아지 — 좌우 스와이프 카드, 페이지 도트, 강아지 추가
 *   2) 발도장 설정 — 활성 강아지 기준 공개 범위 / 안전 설정
 *   3) 앱 설정 — 알림, 약관, 개인정보
 *   4) 로그아웃
 */

import React, { useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm, notify , actionSheet } from '../../src/utils/dialog';
import { AppImage } from '../../src/components/common/AppImage';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/common/Button';
import { Icon, type IconName } from '../../src/components/common/Icon';
import { visibilityLabel, ageGroupLabel, temperamentLabels, walkingStyleLabels } from '../../src/utils/labels';
import type { Dog } from '../../src/types';
import { severSocialSessions } from '@/lib/socialSession';

const MAX_DOGS = 5;

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

// ─── 강아지 프로필 카드 (스와이프 슬롯) ─────────────────────────
/**
 * 강아지 히어로 카드.
 *
 * 활성 강아지 하나를 크게 보여준다. 예전엔 카드 캐러셀이었는데,
 * 한 마리만 키우는 대다수에게는 넘길 것이 없는 빈 제스처였고
 * "지금 어느 아이 기준인지"가 흐릿했다. 전환은 필요할 때만 시트로 연다.
 */
function DogHeroCard({
  dog,
  onEdit,
  onOpenDetail,
  onSwitch,
  switchLabel,
}: {
  dog: Dog;
  onEdit: () => void;
  onOpenDetail: () => void;
  onSwitch?: () => void;
  switchLabel: string;
}) {
  const metaParts = [
    dog.breed,
    ageGroupLabel[dog.age_group],
    dog.weight_kg ? `${dog.weight_kg}kg` : null,
  ].filter(Boolean);
  const dogTags = [
    ...dog.temperament_tags.map(t => temperamentLabels[t]),
    ...dog.walking_style_tags.map(t => walkingStyleLabels[t]),
  ].filter(Boolean).slice(0, 3);

  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        {/* 아바타 — 탭하면 상세 */}
        <TouchableOpacity onPress={onOpenDetail} activeOpacity={0.85} accessibilityLabel={`${dog.name} 상세`}>
          <View style={s.heroAvatarWrap}>
            {dog.avatar_url ? (
              <AppImage source={{ uri: dog.avatar_url }} style={s.heroAvatarImg} resizeMode="cover" />
            ) : (
              <View style={s.heroAvatarPlaceholder}>
                <Icon name="dog" size={34} color={Colors.brand.primary} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={s.heroInfo}>
          <Text style={s.heroEyebrow}>내 산책 파트너</Text>
          <View style={s.heroNameRow}>
            <Text style={s.heroName} numberOfLines={1}>{dog.name}</Text>
            <View style={s.heroBadge}>
              <Icon name="paw-filled" size={10} color="#FFFFFF" />
              <Text style={s.heroBadgeText}>발도장 ON</Text>
            </View>
          </View>
          {metaParts.length > 0 && (
            <Text style={s.heroMeta} numberOfLines={1}>{metaParts.join(' · ')}</Text>
          )}
        </View>
      </View>

      {/* 한 줄 소개 — 성격 태그로는 전해지지 않는 한마디 */}
      {!!dog.bio && (
        <Text style={s.heroBio} numberOfLines={2}>{dog.bio}</Text>
      )}

      {dogTags.length > 0 && (
        <View style={s.heroTagRow}>
          {dogTags.map(tag => (
            <View key={tag} style={s.heroTag}>
              <Text style={s.heroTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 보조 2 : 주 1 — 편집이 더 자주 쓰인다 */}
      <View style={s.heroActions}>
        <TouchableOpacity style={s.heroBtnPrimary} onPress={onEdit} activeOpacity={0.85}>
          <Text style={s.heroBtnPrimaryText}>프로필 편집</Text>
        </TouchableOpacity>
        {onSwitch && (
          <TouchableOpacity style={s.heroBtnGhost} onPress={onSwitch} activeOpacity={0.85}>
            <Text style={s.heroBtnGhostText}>{switchLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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

  // 로그아웃: 확인 다이얼로그 + store 비우기 + 인증화면 이동
  const handleLogout = useCallback(async () => {
    if (await confirm('정말 로그아웃할까요?', { title: '로그아웃', confirmText: '로그아웃', destructive: true })) {
      // 서버 세션까지 종료해야 함 — store만 비우면 useAuth가 잔존 세션을 복원해 자동 재로그인됨
      try { await supabase.auth.signOut(); } catch { /* 세션 없음 등은 무시 */ }
      // 카카오/구글 SDK 세션도 함께 끊는다.
      //   남겨두면 다음 로그인 때 계정 선택 없이 직전 계정으로 자동 재로그인되어
      //   계정 전환이 불가능하고, 기기를 넘겨받은 사람이 이전 계정에 들어갈 수 있다.
      await severSocialSessions();
      logout();
      router.replace('/(auth)/splash');
    }
  }, [logout, router]);

  const openSupport = useCallback(() => {
    Linking.openURL('mailto:support@9factorial.com?subject=DogEar%20%EB%AC%B8%EC%9D%98')
      .catch(() => notify('support@9factorial.com으로 직접 문의해 주세요.', '메일 앱을 열 수 없어요'));
  }, []);

  const canAddMore = dogs.length < MAX_DOGS;

  /**
   * 강아지 바꾸기 — 바텀시트.
   *   예전엔 카드 캐러셀을 옆으로 넘겨 고르게 했는데, 한 마리만 키우는 대다수에게는
   *   넘길 것이 없는 빈 제스처였고 활성 강아지가 무엇인지도 흐릿했다.
   *   활성 강아지 하나를 크게 보여주고, 전환은 필요할 때만 시트로 연다(IA §4).
   */
  const handleSwitchDog = useCallback(async () => {
    const others = dogs.filter(d => d.dog_id !== activeDog?.dog_id);
    const items = [
      ...others.map(d => ({ label: d.name })),
      ...(canAddMore ? [{ label: '+ 강아지 추가' }] : []),
    ];
    if (items.length === 0) return;
    const idx = await actionSheet('강아지 바꾸기', items);
    if (idx < 0) return;
    if (idx < others.length) setActiveDog(others[idx]);
    else router.push('/(auth)/dog-setup');
  }, [dogs, activeDog, canAddMore, setActiveDog, router]);

  const handleOpenDetail = useCallback((dog: Dog) => {
    setActiveDog(dog);            // 상세는 활성 강아지 기준 데이터를 보여줌
    router.push('/dog-detail' as any);
  }, [setActiveDog, router]);

  const handleEdit = useCallback((dog: Dog) => {
    setActiveDog(dog);
    router.push('/dog-edit');
  }, [setActiveDog, router]);

  // 강아지 없음 → 등록 유도(비차단) + 설정/로그아웃/탈퇴는 계속 접근 가능해야 함
  if (!activeDog || dogs.length === 0) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 강아지 등록 유도 카드 (막지 않음 — 나중에 등록 가능) */}
          <View style={s.loginPrompt}>
            <View style={s.loginIconWrap}>
              <Icon name="dog" size={48} color={Colors.brand.primary} />
            </View>
            <Text style={s.loginTitle}>강아지 프로필을 만들어주세요</Text>
            <Text style={s.emptyHint}>지금 등록하면 맞춤 산책 추천을 받을 수 있어요. 나중에 등록해도 괜찮아요.</Text>
            <Button
              label="강아지 등록하기"
              onPress={() => router.push('/(auth)/dog-setup')}
              variant="primary"
              size="l"
            />
          </View>

          {/* 설정 — 강아지 없이도 접근 가능 */}
          <View style={s.section}>
            <View style={s.sectionTitleRow}>
              <Icon name="settings" size={15} color={Colors.text.secondary} />
              <Text style={s.sectionTitle}>설정</Text>
            </View>
            <View style={s.settingsCard}>
              <SettingsRow icon="bell"     label="알림 설정"     onPress={() => router.push('/notification-settings' as any)} />
              <SettingsRow icon="settings" label="앱 권한"       onPress={() => router.push('/app-permissions' as any)} />
            <SettingsRow icon="person"   label="차단한 사용자" onPress={() => router.push('/blocked-users')} />
              <SettingsRow icon="person"   label="계정 관리"    onPress={() => router.push('/account-delete')} />
            </View>
          </View>

          {/* 약관 및 지원 */}
          <View style={s.section}>
            <View style={s.sectionTitleRow}>
              <Icon name="document" size={15} color={Colors.text.secondary} />
              <Text style={s.sectionTitle}>약관 및 지원</Text>
            </View>
            <View style={s.settingsCard}>
              <SettingsRow icon="document" label="약관 및 정책"  onPress={() => router.push('/settings')} />
              <SettingsRow icon="help"     label="고객센터 문의" onPress={openSupport} />
            </View>
          </View>

          {/* 로그아웃 */}
          <View style={s.section}>
            <View style={s.settingsCard}>
              <SettingsRow icon="logout" label="로그아웃" onPress={handleLogout} />
            </View>
          </View>

          <Text style={s.versionText}>버전 1.0.0</Text>
          <View style={{ height: Spacing[16] }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const currentVisibility = privacySetting.default_visibility_level;
  const visibilityText    = visibilityLabel[currentVisibility] ?? currentVisibility;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════
            1) 내 강아지 — 스와이프 캐러셀
        ══════════════════════════════════════ */}
        {/* ══════════════════════════════════════
            1) 내 강아지 — 히어로 카드
        ══════════════════════════════════════ */}
        <DogHeroCard
          dog={activeDog}
          onEdit={() => handleEdit(activeDog)}
          onOpenDetail={() => handleOpenDetail(activeDog)}
          onSwitch={dogs.length > 1 || canAddMore ? handleSwitchDog : undefined}
          switchLabel={dogs.length > 1 ? '강아지 바꾸기' : '강아지 추가'}
        />

        {/* ══════════════════════════════════════
            2) 발도장 설정 (활성 강아지 기준)
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="lock" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>
              발도장 설정
              <Text style={s.sectionTitleDog}> · {activeDog.name}</Text>
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
            3) 설정 — 알림 / 차단 / 계정 관리
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="settings" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>설정</Text>
          </View>
          <View style={s.settingsCard}>
            <SettingsRow icon="bell"     label="알림 설정"     onPress={() => router.push('/notification-settings' as any)} />
            <SettingsRow icon="settings" label="앱 권한"       onPress={() => router.push('/app-permissions' as any)} />
            <SettingsRow icon="person"   label="차단한 사용자" onPress={() => router.push('/blocked-users')} />
            <SettingsRow icon="person"   label="계정 관리"    onPress={() => router.push('/account-delete')} />
          </View>
        </View>

        {/* ══════════════════════════════════════
            4) 약관 및 지원
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="document" size={15} color={Colors.text.secondary} />
            <Text style={s.sectionTitle}>약관 및 지원</Text>
          </View>
          <View style={s.settingsCard}>
            <SettingsRow icon="document" label="약관 및 정책"  onPress={() => router.push('/settings')} />
            <SettingsRow icon="help"     label="고객센터 문의" onPress={openSupport} />
          </View>
        </View>

        {/* ══════════════════════════════════════
            5) 로그아웃 — 조용한 단일 행
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.settingsCard}>
            <SettingsRow icon="logout" label="로그아웃" onPress={handleLogout} />
          </View>
        </View>

        <Text style={s.versionText}>버전 1.0.0</Text>

        <View style={{ height: Spacing[16] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── 강아지 히어로 카드 ────────────────────────────────────
  hero: {
    marginHorizontal: Spacing[16],
    marginTop: Spacing[12],
    marginBottom: Spacing[20],
    padding: Spacing[16],
    borderRadius: Radius.card,
    backgroundColor: Colors.brand.primary,
    gap: Spacing[12],
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[14] },
  heroAvatarWrap: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  heroAvatarImg: { width: '100%', height: '100%' },
  heroAvatarPlaceholder: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brand.subtle,
  },
  heroInfo: { flex: 1, minWidth: 0, gap: 2 },
  heroEyebrow: {
    ...Typography.label.s,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  heroName: {
    ...Typography.title.l,
    color: '#FFFFFF',
    fontWeight: '800',
    flexShrink: 1,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing[8], paddingVertical: 2,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroBadgeText: { ...Typography.label.s, color: '#FFFFFF', fontWeight: '700' },
  heroMeta: { ...Typography.label.m, color: 'rgba(255,255,255,0.9)' },
  heroBio: {
    ...Typography.body.s,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 19,
  },
  heroTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[6] },
  heroTag: {
    paddingHorizontal: Spacing[10], paddingVertical: 4,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroTagText: { ...Typography.label.s, color: '#FFFFFF', fontWeight: '600' },
  heroActions: { flexDirection: 'row', gap: Spacing[8] },
  heroBtnPrimary: {
    flex: 2, height: 44, borderRadius: Radius.round,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroBtnPrimaryText: { ...Typography.label.l, color: Colors.brand.accent, fontWeight: '700' },
  heroBtnGhost: {
    flex: 1, height: 44, borderRadius: Radius.round,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  heroBtnGhostText: { ...Typography.label.l, color: '#FFFFFF', fontWeight: '700' },

  safe:    { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:  { flex: 1 },
  content: { paddingTop: Spacing[20], paddingBottom: Spacing[24] },

  // 로그인 유도
  loginPrompt: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing[40], paddingHorizontal: Spacing[24], gap: Spacing[12],
  },
  loginIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  loginTitle: { ...Typography.title.m, color: Colors.text.primary, textAlign: 'center' },
  emptyHint: { ...Typography.body.s, color: Colors.text.tertiary, textAlign: 'center', marginBottom: Spacing[4] },

  // 캐러셀 섹션
  // 스와이프 트랙
  // 강아지 카드
  // 아바타
  // 텍스트 영역
  // 이름 행
  // 품종 · 나이 · 체중 (홈과 동일 포맷)
  // 성향 태그 칩 — 홈 profileTag와 동일 토큰
  // 카드 하단 (배지 or 편집 버튼)
  // 활성 배지
  // 프로필 편집 버튼 (비활성 카드)
  // 페이지 도트
  // 공통 섹션
  section: {
    marginHorizontal: Spacing[16],
    marginBottom: Spacing[24],
    gap: Spacing[10],
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
  versionText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingTop: Spacing[16],
  },
  sectionTitleDog: {
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
