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
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Linking, Dimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm, notify , actionSheet } from '../../src/utils/dialog';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/common/Button';
import { Icon, type IconName } from '../../src/components/common/Icon';
import { visibilityLabel } from '../../src/utils/labels';
import { DogProfileCard } from '../../src/components/dog/DogProfileCard';
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

// ─── 강아지 카드 (스와이프 슬롯) ────────────────────────────────
/**
 * 강아지 한 마리를 보여주는 카드. 여러 마리면 좌우로 넘긴다.
 *
 * 카드에는 이름·기본 정보·소개만 둔다.
 * 편집·추가는 화면 우측 상단 ⋯ 로 뺐다 — 프로필은 한 번 맞춰두면 거의 안 건드리는데
 * 카드 절반을 버튼이 차지하고 있었다.
 */
function DogCard({ dog, width, onOpenDetail }: { dog: Dog; width: number; onOpenDetail: () => void }) {
  return (
    <View style={{ width }}>
      {/* 홈의 강아지 카드와 같은 컴포넌트다 — 두 화면이 딴 물건처럼 보이지 않도록 */}
      <DogProfileCard dog={dog} onPress={onOpenDetail} showBio style={s.hero} />
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
  const handleMore = useCallback(async () => {
    // 프로필 편집·강아지 추가는 자주 쓰는 동작이 아니다. 카드에서 빼 ⋯ 로 모은다.
    const items = [
      { label: '프로필 편집' },
      ...(canAddMore ? [{ label: '강아지 추가' }] : []),
    ];
    const idx = await actionSheet(activeDog?.name ?? '내 강아지', items);
    if (idx === 0 && activeDog) {
      setActiveDog(activeDog);
      router.push('/dog-edit');
    } else if (idx === 1) {
      router.push('/(auth)/dog-setup');
    }
  }, [activeDog, canAddMore, setActiveDog, router]);

  // 스와이프로 활성 강아지를 바꾼다 — 별도 '바꾸기' 버튼 없이 카드가 곧 전환 수단이다
  const pageWidth = Dimensions.get('window').width;
  const handleDogPageChange = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      const next = dogs[idx];
      if (next && next.dog_id !== activeDog?.dog_id) setActiveDog(next);
    },
    [dogs, activeDog, setActiveDog, pageWidth],
  );

  const handleOpenDetail = useCallback((dog: Dog) => {
    setActiveDog(dog);            // 상세는 활성 강아지 기준 데이터를 보여줌
    router.push('/dog-detail' as any);
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
            1) 내 강아지 — 좌우 스와이프
        ══════════════════════════════════════ */}
        <View style={s.topBar}>
          <Text style={s.topTitle}>내 강아지</Text>
          <TouchableOpacity
            style={s.topMoreBtn}
            onPress={handleMore}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="강아지 프로필 메뉴"
          >
            <Icon name="more" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleDogPageChange}
          scrollEventThrottle={16}
        >
          {dogs.map(d => (
            <DogCard
              key={d.dog_id}
              dog={d}
              width={pageWidth}
              onOpenDetail={() => handleOpenDetail(d)}
            />
          ))}
        </ScrollView>

        {/* 여러 마리일 때만 도트 — 한 마리면 넘길 것이 없다 */}
        {dogs.length > 1 && (
          <View style={s.dots}>
            {dogs.map(d => (
              <View
                key={d.dog_id}
                style={[s.dot, d.dog_id === activeDog.dog_id && s.dotActive]}
              />
            ))}
          </View>
        )}

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
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[16], paddingTop: Spacing[8],
  },
  topTitle: { ...Typography.title.m, color: Colors.text.primary, fontWeight: '700' },
  topMoreBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing[6], marginTop: -Spacing[12], marginBottom: Spacing[16] },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border.default },
  dotActive: { backgroundColor: Colors.brand.primary, width: 18 },

  // 카드 자체의 생김새는 DogProfileCard가 갖는다. 여기서는 배치만 정한다.
  hero: {
    marginHorizontal: Spacing[16],
    marginTop: Spacing[12],
    marginBottom: Spacing[20],
  },

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
