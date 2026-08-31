/**
 * 마이 탭
 *
 * 역할: 여러 강아지 프로필과 서비스 설정을 관리
 *
 * 구조:
 *   1) 내 강아지 — 좌우 스와이프 카드(공개 상태 요약 포함), 페이지 도트
 *   2) 사진 — 내가 올린 사진 3장 미리보기 + 전체보기
 *   3) 앱 설정 — 알림, 약관, 개인정보
 *   4) 로그아웃
 *
 * 공개 설정은 여기서 바꾸지 않는다 — 카드엔 요약만 띄우고 관리는 강아지 상세에서 한다.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Linking, Dimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm, actionSheet } from '../../src/utils/dialog';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { toast } from '../../src/utils/toast';
import { SUPPORT_EMAIL } from '../../src/constants/messages';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/common/Button';
import { Icon, type IconName } from '../../src/components/common/Icon';
import { AppImage } from '../../src/components/common/AppImage';
import { visibilityLabel } from '../../src/utils/labels';
import { DogCarousel } from '../../src/components/dog/DogCarousel';
import { DogCardFooter } from '../../src/components/dog/DogProfileCard';
import type { Dog, PrivacySetting } from '../../src/types';
import { severSocialSessions } from '@/lib/socialSession';

const MAX_DOGS = 5;

/** 사진 미리보기 — 장소 상세와 같은 3열 한 줄 */
const PHOTO_PREVIEW = 3;
const PHOTO_GAP = 6;
const PHOTO_CELL = (Dimensions.get('window').width - Spacing[16] * 2 - PHOTO_GAP * 2) / PHOTO_PREVIEW;

/**
 * 최근 사진 3장 — 마이에서 바로 보여주는 미리보기.
 *
 * 예전엔 '내가 올린 사진 ›' 텍스트 행 하나였다. 사진을 모아둔 곳인데 사진이
 * 한 장도 안 보여서, 눌러보기 전엔 뭐가 있는지 알 수 없었다.
 * 장소 상세의 「사진」 섹션과 같은 모양으로 맞춘다.
 */
function useRecentPhotos(dogIds: string[]) {
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const key = dogIds.join(',');

  useEffect(() => {
    let alive = true;
    if (dogIds.length === 0) { setPhotos([]); return; }
    (async () => {
      // ⚠️ status는 'visible' | 'hidden'이다('active'가 아니다).
      //    여기선 spots 조인이 필요 없으므로 PGRST201(모호한 임베드) 걱정도 없다.
      const { data, error } = await supabase
        .from('checkin_photos')
        .select('id, image_url')
        .in('dog_id', dogIds)
        .eq('status', 'visible')
        .order('created_at', { ascending: false })
        .limit(PHOTO_PREVIEW);
      if (!alive) return;
      // 미리보기 실패는 조용히 접는다 — 설정 화면 전체를 토스트로 막을 일이 아니다.
      if (error) { setPhotos([]); return; }
      setPhotos((data ?? []).map((r: any) => ({ id: r.id, url: r.image_url })));
    })();
    return () => { alive = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  return photos;
}

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
/**
 * 카드 안 공개 설정 요약 — 읽기 전용. 관리는 강아지 상세에서.
 *
 * 줄의 생김새는 DogCardFooter가 갖는다(홈의 '최근 산책'과 같은 자리·같은 모양).
 * 화살표는 붙이지 않는다 — 이 줄만 따로 눌리는 것처럼 보이는데 실제로는
 * 카드 전체가 하나의 문이다(중복 신호).
 *
 * 상태는 둘뿐이다 — 공개인지 아닌지. '장소 분위기에만' 같은 내부 용어를 쓰지 않는다.
 * 사용자가 궁금한 건 "우리 아이가 남들에게 보이나"이지 기여 범위의 이름이 아니다.
 */
function DogPrivacySummary({ setting }: { setting: PrivacySetting }) {
  return (
    <DogCardFooter
      icon="lock"
      text={setting.allow_familiar_layer_exposure
        ? '우리 아이 프로필 공개 중'
        : '프로필 없이 기록 중'}
    />
  );
}

// ─── 메인 ────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router               = useRouter();
  const activeDog            = useAppStore(s => s.activeDog);
  const dogs                 = useAppStore(s => s.dogs);
  const setActiveDog         = useAppStore(s => s.setActiveDog);
  const privacySetting       = useAppStore(s => s.privacySetting);
  const privacySettingsByDog = useAppStore(s => s.privacySettingsByDog);
  const updatePrivacySetting = useAppStore(s => s.updatePrivacySetting);
  const logout               = useAppStore(s => s.logout);

  const recentPhotos = useRecentPhotos(useMemo(() => dogs.map(d => d.dog_id), [dogs]));

  // 로그아웃: 확인 다이얼로그 + store 비우기 + 인증화면 이동
  const handleLogout = useCallback(async () => {
    if (await confirm('기록은 그대로 남아요. 다시 로그인하면 이어서 볼 수 있어요.', { title: '로그아웃할까요?', confirmText: '로그아웃', destructive: true })) {
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
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=DogEar%20%EB%AC%B8%EC%9D%98`)
      // 메일 앱이 없을 때 "직접 보내세요"라고만 하면 주소를 외워야 한다 → 복사까지 해준다(§3.0-4)
      .catch(async () => {
        await Clipboard.setStringAsync(SUPPORT_EMAIL);
        toast.success('문의 주소를 복사했어요');
      });
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

        <DogCarousel
          dogs={dogs}
          activeDogId={activeDog.dog_id}
          onActiveChange={setActiveDog}
          onOpenDetail={handleOpenDetail}
          style={s.hero}
          renderFooter={d => {
            const setting = privacySettingsByDog[d.dog_id];
            return setting ? <DogPrivacySummary setting={setting} /> : undefined;
          }}
        />

        {/* ══════════════════════════════════════
            2) 사진 — 내가 올린 사진
            설정과 분리한다. 설정은 '앞으로 어떻게 할지'이고 여기는 '이미 남긴 것'이다.
            텍스트 행 하나였던 것을 3장 미리보기로 바꿨다 — 사진을 모아둔 곳인데
            사진이 한 장도 안 보여서 눌러보기 전엔 뭐가 있는지 알 수 없었다.
        ══════════════════════════════════════ */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={s.sectionTitleRow}>
              <Icon name="image" size={15} color={Colors.text.secondary} />
              {/* '내 갤러리' → '사진'. 장소 상세도 '사진'이라 부른다 —
                  같은 것을 두 이름으로 부르고 있었다. '갤러리'는 기능 이름이고
                  '사진'은 물건 이름이다. 사용자가 찾는 건 물건이다. */}
              <Text style={s.sectionTitle}>사진</Text>
            </View>
            {recentPhotos.length > 0 && (
              <TouchableOpacity
                style={s.sectionMore}
                onPress={() => router.push('/my-gallery' as any)}
                accessibilityRole="button"
              >
                <Text style={s.sectionMoreText}>전체보기</Text>
                <Icon name="forward" size={12} color={Colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
          {recentPhotos.length === 0 ? (
            <TouchableOpacity
              style={s.photoEmpty}
              onPress={() => router.push('/my-gallery' as any)}
              activeOpacity={0.8}
            >
              <Text style={s.photoEmptyText}>아직 올린 사진이 없어요</Text>
              <Text style={s.photoEmptySub}>발도장을 남길 때 사진을 함께 올리면 여기에 모여요.</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.photoRow}>
              {recentPhotos.map(ph => (
                <TouchableOpacity
                  key={ph.id}
                  style={s.photoCell}
                  activeOpacity={0.9}
                  onPress={() => router.push('/my-gallery' as any)}
                  accessibilityRole="image"
                  accessibilityLabel="내가 올린 사진"
                >
                  <AppImage source={{ uri: ph.url }} style={s.photoImg} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>
          )}
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

  // ── 카드 안 공개 설정 요약 ──────────────────────────────
  // 카드가 솔리드 오렌지라 색을 여기서 맞춘다. 읽기 전용이라 컨트롤은 없다.
  // 카드에 gap:12가 이미 있어 위 여백은 그것으로 충분하다.
  // 여기에 marginTop을 더 주면 선 위(14)와 아래(10)가 어긋나 나뉜 느낌이 안 난다.
  // ── 사진 미리보기 (장소 상세의 「사진」 섹션과 같은 규격) ──
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[16],
  },
  sectionMore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionMoreText: { ...Typography.label.s, color: Colors.text.tertiary },
  photoRow: {
    flexDirection: 'row', gap: PHOTO_GAP,
    paddingHorizontal: Spacing[16], marginTop: Spacing[10],
  },
  photoCell: {
    width: PHOTO_CELL, aspectRatio: 1,
    borderRadius: Radius.m, overflow: 'hidden', backgroundColor: Colors.bg.secondary,
  },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: {
    marginHorizontal: Spacing[16], marginTop: Spacing[10],
    paddingVertical: Spacing[20], paddingHorizontal: Spacing[16],
    borderRadius: Radius.l, backgroundColor: Colors.bg.secondary,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  photoEmptyText: { ...Typography.body.s, color: Colors.text.secondary, fontWeight: '600' },
  photoEmptySub: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 3, lineHeight: 17 },

  // 카드 생김새는 DogProfileCard가, 카드 인셋·도트 간격은 DogCarousel이 갖는다
  // (홈과 공용). 여기서 정하는 것은 블록 바깥 여백뿐이다.
  hero: {
    marginTop: Spacing[4],
    marginBottom: Spacing[16],
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
