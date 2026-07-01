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

import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, SafeAreaView, Dimensions, NativeScrollEvent,
  NativeSyntheticEvent, Linking,
} from 'react-native';
import { confirm, notify } from '../../src/utils/dialog';
import { AppImage } from '../../src/components/common/AppImage';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Button } from '../../src/components/common/Button';
import { Icon, type IconName } from '../../src/components/common/Icon';
import { sizeLabel, visibilityLabel } from '../../src/utils/labels';
import type { Dog } from '../../src/types';

const { width: SCREEN_W } = Dimensions.get('window');
// 카드 좌우 여백 — 옆 카드가 살짝 보이도록
const CARD_H_PADDING = Spacing[16];
const CARD_GAP       = Spacing[12];
const CARD_W         = SCREEN_W - CARD_H_PADDING * 2;
const MAX_DOGS       = 5;

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
function DogProfileCard({
  dog,
  isActive,
  onOpenDetail,
  onEdit,
}: {
  dog: Dog;
  isActive: boolean;
  onOpenDetail: () => void;
  onEdit: () => void;
}) {
  const metaParts = [
    dog.breed,
    sizeLabel[dog.size],
    dog.weight_kg ? `${dog.weight_kg}kg` : null,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={[s.dogCard, isActive ? s.dogCardActive : s.dogCardInactive]}
      onPress={onOpenDetail}
      activeOpacity={0.85}
    >
      {/* 아바타 */}
      <View style={[s.dogAvatarWrap, isActive && s.dogAvatarWrapActive]}>
        {dog.avatar_url ? (
          <AppImage source={{ uri: dog.avatar_url }} style={s.dogAvatarImg} resizeMode="cover" />
        ) : (
          <View style={s.dogAvatarPlaceholder}>
            <Text style={s.dogAvatarInitial}>{dog.name[0]}</Text>
          </View>
        )}
      </View>

      {/* 텍스트 영역 */}
      <View style={s.dogInfo}>
        {/* 이름 + 발도장 활성 배지 (우측 상단) */}
        <View style={s.dogNameRow}>
          <Text style={[s.dogName, isActive && s.dogNameActive]}>{dog.name}</Text>
          {isActive && (
            <View style={s.activeBadge}>
              <Icon name="paw-filled" size={10} color={Colors.brand.primary} />
              <Text style={s.activeBadgeText}>발도장 활성 중</Text>
            </View>
          )}
        </View>

        {/* 견종 · 몸집 · 체중 */}
        <Text style={s.dogMeta}>{metaParts.join(' · ')}</Text>

        {/* 프로필 편집 버튼 (하단) */}
        <View style={s.dogCardFooter}>
          <TouchableOpacity
            style={s.editPill}
            onPress={onEdit}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={s.editPillText}>프로필 편집</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── 페이지 도트 ─────────────────────────────────────────────────
function PageDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={s.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[s.dot, i === current && s.dotActive]}
        />
      ))}
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
      logout();
      router.replace('/(auth)/splash');
    }
  }, [logout, router]);

  const openSupport = useCallback(() => {
    Linking.openURL('mailto:seungil.office@gmail.com?subject=DogEar%20%EB%AC%B8%EC%9D%98')
      .catch(() => notify('seungil.office@gmail.com으로 직접 문의해 주세요.', '메일 앱을 열 수 없어요'));
  }, []);

  // 현재 보이는 슬롯 인덱스 (강아지 카드 + 추가 카드)
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const canAddMore  = dogs.length < MAX_DOGS;
  const totalSlots  = dogs.length; // 추가 카드 없이 강아지 수만

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x   = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / (CARD_W + CARD_GAP));
      setPageIndex(idx);
    },
    [],
  );

  const handleOpenDetail = useCallback((dog: Dog) => {
    setActiveDog(dog);            // 상세는 활성 강아지 기준 데이터를 보여줌
    router.push('/dog-detail' as any);
  }, [setActiveDog, router]);

  const handleEdit = useCallback((dog: Dog) => {
    setActiveDog(dog);
    router.push('/dog-edit');
  }, [setActiveDog, router]);

  const handleAddDog = useCallback(() => {
    router.push('/(auth)/dog-setup');
  }, [router]);

  // 강아지 없음 → 온보딩 유도
  if (!activeDog || dogs.length === 0) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loginPrompt}>
          <View style={s.loginIconWrap}>
            <Icon name="dog" size={48} color={Colors.brand.primary} />
          </View>
          <Text style={s.loginTitle}>강아지 프로필을 만들어주세요</Text>
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

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════
            1) 내 강아지 — 스와이프 캐러셀
        ══════════════════════════════════════ */}
        <View style={s.carouselSection}>
          {/* 섹션 헤더 */}
          <View style={s.carouselHeader}>
            <View style={s.sectionTitleRow}>
              <Icon name="paw" size={15} color={Colors.text.secondary} />
              <Text style={s.sectionTitle}>내 강아지</Text>
            </View>
            {canAddMore && (
              <TouchableOpacity
                style={s.addDogBtn}
                onPress={handleAddDog}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="plus" size={14} color={Colors.brand.primary} />
                <Text style={s.addDogBtnText}>강아지 추가</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 스와이프 영역 */}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled={false}           // 카드 단위 스냅 (snapToInterval)
            snapToInterval={CARD_W + CARD_GAP}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={s.carouselTrack}
          >
            {dogs.map(dog => (
              <DogProfileCard
                key={dog.dog_id}
                dog={dog}
                isActive={dog.dog_id === activeDog.dog_id}
                onOpenDetail={() => handleOpenDetail(dog)}
                onEdit={() => handleEdit(dog)}
              />
            ))}
          </ScrollView>

          {/* 페이지 도트 */}
          {totalSlots > 1 && (
            <PageDots total={totalSlots} current={pageIndex} />
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
            <SettingsRow icon="bell"     label="알림"        onPress={() => router.push('/notifications')} />
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
  safe:    { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:  { flex: 1 },
  content: { paddingTop: Spacing[20], paddingBottom: Spacing[24] },

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

  // 캐러셀 섹션
  carouselSection: {
    marginBottom: Spacing[28],
    gap: Spacing[12],
  },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_H_PADDING,
  },
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
  addDogBtnText: {
    ...Typography.label.s,
    color: Colors.brand.primary,
    fontWeight: '600',
  },

  // 스와이프 트랙
  carouselTrack: {
    paddingHorizontal: CARD_H_PADDING,
    gap: CARD_GAP,
  },

  // 강아지 카드
  dogCard: {
    width: CARD_W,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[20],
    gap: Spacing[16],
  },
  dogCardActive: {
    backgroundColor: Colors.brand.subtle,
    borderColor: Colors.border.brand,
  },
  dogCardInactive: {
    backgroundColor: Colors.surface.default,
    borderColor: Colors.border.default,
  },

  // 아바타
  dogAvatarWrap: {
    width: 68, height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: Colors.border.default,
    backgroundColor: Colors.bg.secondary,
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
    ...Typography.display.s,
    color: Colors.brand.accent,
    fontWeight: '700',
  },

  // 텍스트 영역
  dogInfo: {
    flex: 1,
    gap: Spacing[4],
  },

  // 이름 행
  dogNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[8],
  },
  dogName: {
    ...Typography.title.m,
    color: Colors.text.primary,
    fontWeight: '800',
  },
  dogNameActive: {
    color: Colors.brand.accent,
  },

  // 견종 · 몸집 · 체중
  dogMeta: {
    ...Typography.body.s,
    color: Colors.text.secondary,
  },

  // 카드 하단 (배지 or 편집 버튼)
  dogCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing[4],
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

  // 프로필 편집 버튼 (비활성 카드)
  editPill: {
    paddingHorizontal: Spacing[12],
    paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.strong,
  },
  editPillText: {
    ...Typography.label.s,
    color: Colors.text.secondary,
    fontWeight: '600',
  },

  // 페이지 도트
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[6],
  },
  dot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border.strong,
  },
  dotActive: {
    width: 18,
    backgroundColor: Colors.brand.primary,
    borderRadius: 3,
  },

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
  sectionFootnote: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[6],
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
