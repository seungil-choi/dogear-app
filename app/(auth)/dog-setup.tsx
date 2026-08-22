import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { stripExif } from '../../src/lib/stripExif';
import { AppImage } from '../../src/components/common/AppImage';
import { uploadImage } from '../../src/lib/uploadImage';
import { isObjectionable, MODERATION_BLOCK_MESSAGE } from '../../src/utils/moderation';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/common/Button';
import { Icon } from '../../src/components/common/Icon';
import type { DogSize, DogAgeGroup, Dog } from '../../src/types';
import { sizeLabel, ageGroupLabel } from '../../src/utils/labels';
import { toast } from '../../src/utils/toast';
import { OK, PERM, PHOTO } from '../../src/constants/messages';

import { IS_REAL_AUTH } from '../../src/config/env';

/** 체중은 선택 항목이지만, 넣었다면 말이 되는 값이어야 한다 */
function weightErrorOf(raw: string): string {
  if (!raw.trim()) return '';
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0 || n >= 100) return '0보다 크고 100kg 미만으로 입력해주세요';
  return '';
}

const SIZES: DogSize[] = ['small', 'medium', 'large'];
const AGE_GROUPS: DogAgeGroup[] = ['puppy', 'adult', 'senior'];

const TEMPERAMENT_OPTIONS: { key: string; label: string }[] = [
  { key: 'active',     label: '활발해요' },
  { key: 'quiet',      label: '조용해요' },
  { key: 'shy',        label: '낯가려요' },
  { key: 'friendly',   label: '사교적이에요' },
  { key: 'sensitive',  label: '겁이 많아요' },
  { key: 'confident',  label: '용감해요' },
];
const WALKING_OPTIONS: { key: string; label: string }[] = [
  { key: 'frequent_walks', label: '짧게 자주' },
  { key: 'slow_pace',      label: '길게 천천히' },
  { key: 'sniffing',       label: '냄새 탐색' },
  { key: 'running',        label: '달리기 좋아함' },
  { key: 'fixed_route',    label: '특정 루트 선호' },
];

export default function DogSetupScreen() {
  const router = useRouter();
  const completeOnboarding = useAppStore(s => s.completeOnboarding);
  const registerDog        = useAppStore(s => s.registerDog);
  const user               = useAppStore(s => s.user);

  // 온보딩 연속 흐름에서 왔는지. 그 경우에만 '건너뛰기'가 의미가 있다
  // (직접 들어온 사람에겐 건너뛸 다음 단계가 없고, 대신 '취소'로 되돌아가면 된다).
  const params = useLocalSearchParams<{ from?: string }>();
  const isOnboarding = params.from === 'onboarding';

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [breed, setBreed] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [size, setSize] = useState<DogSize>('small');
  const [ageGroup, setAgeGroup] = useState<DogAgeGroup>('adult');
  const [selectedTemperament, setSelectedTemperament] = useState<string[]>([]);
  const [selectedWalking, setSelectedWalking] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  /** 부적절 표현은 어느 칸이 문제인지 알려줘야 고칠 수 있다 — 필드별로 나눠 표시 */
  const [nameBlocked, setNameBlocked] = useState(false);
  const [bioBlocked, setBioBlocked] = useState(false);

  const weightError = weightErrorOf(weightKg);

  // 가입 funnel 진입 추적 (마운트 시점 1회)
  useEffect(() => {
    track(EVENT.dog_profile_create_started, { screen_name: 'dog_setup' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleItem = (arr: string[], key: string, setter: (v: string[]) => void) => {
    if (arr.includes(key)) setter(arr.filter(i => i !== key));
    else setter([...arr, key]);
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(PERM.photo, '권한 필요');   // 설정으로 가야 풀리는 문제 → Alert 유지(§2.2)
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      // 아바타는 '익숙한 강아지' 등으로 남에게 보인다 — 촬영 좌표를 지우고 들고 간다.
      if (!res.canceled && res.assets?.[0]) setPhotoUri(await stripExif(res.assets[0].uri));
    } catch {
      toast.error(PHOTO.loadFailed);
    }
  };

  const handleDone = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);

    // UGC 사전 필터 — 이름·소개는 다른 보호자에게 보인다 (Apple 1.2)
    // 입력 문제이므로 모달이 아니라 **문제가 있는 칸 아래**에 표시한다(§2.1-1)
    const badName = isObjectionable(name);
    const badBio  = isObjectionable(bio);
    setNameBlocked(badName);
    setBioBlocked(badBio);
    if (badName || badBio || weightError) {
      setIsSaving(false);
      return;
    }

    const weightNum = weightKg.trim() ? parseFloat(weightKg) : undefined;

    // 사진은 스토리지에 먼저 올린다. 로컬 file:// 경로를 DB에 넣으면 다른 기기에서 깨진다.
    // 업로드 실패는 등록 자체를 막지 않고 사진만 포기한다.
    let avatarUrl: string | undefined;
    if (photoUri && IS_REAL_AUTH) {
      try {
        const up = await uploadImage({ bucket: 'dog-avatars', uri: photoUri });
        avatarUrl = up.url;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[dog-setup] 사진 업로드 실패 — 사진 없이 등록을 이어갑니다:', e);
        // 등록 자체는 계속된다 → 흐름을 끊지 않는다. 원문 오류는 콘솔에만 남긴다.
        toast.error('사진만 올리지 못했어요. 프로필 편집에서 다시 넣을 수 있어요');
      }
    } else if (photoUri) {
      avatarUrl = photoUri;   // 데모 모드는 로컬 URI 그대로
    }

    if (IS_REAL_AUTH && user) {
      // 실 환경: Supabase dogs 테이블에 저장 → DB 생성 UUID 사용
      const { data, error } = await supabase
        .from('dogs')
        .insert({
          user_id: user.user_id,
          name: name.trim(),
          avatar_url: avatarUrl ?? null,
          bio: bio.trim() || null,
          breed: breed.trim() || null,
          weight_kg: weightNum ?? null,
          size,
          age_group: ageGroup,
          temperament_tags: selectedTemperament,
          walking_style_tags: selectedWalking,
          is_active: true,
        })
        .select()
        .single();

      if (error || !data) {
        toast.error('등록하지 못했어요. 잠시 후 다시 시도해주세요');
        setIsSaving(false);
        return;
      }

      // UGC 이미지 사후 모더레이션 큐 적재 (Apple 1.2) — dog-edit과 같은 규칙.
      // dog_id는 insert 이후에야 정해지므로 여기서 넣는다.
      // 이 화면에서 올린 사진이 대부분인데 여기가 비어 있으면 검수 큐가 사실상 놀게 된다.
      if (avatarUrl) {
        supabase
          .from('media_moderation_queue')
          .insert({ content_type: 'dog_avatar', dog_id: data.dog_id, image_url: avatarUrl })
          .then(({ error: qError }) => {
            if (qError) console.error('moderation queue insert failed:', qError);
          });
      }

      const newDog: Dog = {
        dog_id: data.dog_id,
        user_id: data.user_id,
        name: data.name,
        avatar_url: data.avatar_url ?? undefined,
        bio: data.bio ?? undefined,
        breed: data.breed ?? undefined,
        weight_kg: data.weight_kg ?? undefined,
        size: data.size,
        age_group: data.age_group,
        temperament_tags: data.temperament_tags ?? [],
        walking_style_tags: data.walking_style_tags ?? [],
        is_active: data.is_active,
        created_at: data.created_at,
      };
      registerDog(newDog);
    } else {
      // 목업 환경: 로컬 ID 사용
      const newDog: Dog = {
        dog_id: `dog_${Date.now()}`,
        user_id: user?.user_id ?? 'local',
        name: name.trim(),
        avatar_url: avatarUrl,
        bio: bio.trim() || undefined,
        breed: breed.trim() || undefined,
        weight_kg: weightNum,
        size,
        age_group: ageGroup,
        temperament_tags: selectedTemperament,
        walking_style_tags: selectedWalking,
        created_at: new Date().toISOString(),
        is_active: true,
      };
      registerDog(newDog);
    }

    completeOnboarding();
    track(EVENT.dog_profile_create_completed, {
      screen_name: 'dog_setup',
      has_breed: !!breed.trim(),
      has_photo: !!avatarUrl,
      has_bio: !!bio.trim(),
      has_weight: !!weightNum,
      temperament_count: selectedTemperament.length,
      walking_count: selectedWalking.length,
    });
    // 성공에는 반드시 짧은 확인을 준다(§4.5) — 이전엔 아무 말 없이 화면만 바뀌었다
    toast.success(OK.dogCreated(name.trim()));
    // 등록 완료 후 바로 홈으로 (OS 위치·알림 권한은 홈 진입 시 자동 요청)
    router.replace('/(tabs)');
  };

  // 취소 — 온 곳으로 되돌린다(직접 진입 전용). 등록 상태는 아무것도 바꾸지 않는다.
  const handleCancel = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // 강아지 등록 건너뛰기 — 온보딩 연속 흐름 전용. 마이 탭에서 언제든 추가 가능
  const handleSkip = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const canProceed = name.trim().length > 0 && !isSaving;

  return (
    <SafeAreaView style={s.safe}>
      {/* 헤더 — 건너뛰기는 온보딩 연속 흐름에서만.
          직접 들어온 사람에겐 건너뛸 다음 단계가 없다(하단 취소로 되돌아간다). */}
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <View style={{ flex: 1 }} />
        {isOnboarding && (
          <TouchableOpacity onPress={handleSkip} style={s.skipBtn} hitSlop={8} disabled={isSaving}>
            <Text style={s.skipText}>건너뛰기</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={s.titleRow}>
          <Text style={s.title}>강아지를 소개해주세요</Text>
          <View style={s.optionalBadge}>
            <Text style={s.optionalBadgeText}>선택사항</Text>
          </View>
        </View>
        <Text style={s.desc}>
          지금 등록하면 맞춤 산책 추천을 받을 수 있어요.{'\n'}
          나중에 마이 탭에서 언제든 추가할 수 있어요.
        </Text>

        {/* 사진 (선택) */}
        <View style={s.photoBlock}>
          <TouchableOpacity
            style={s.photoPicker}
            onPress={pickPhoto}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={photoUri ? '사진 바꾸기' : '사진 추가'}
          >
            {photoUri ? (
              <AppImage source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
            ) : (
              <View style={s.photoPlaceholder}>
                <Icon name="dog" size={30} color={Colors.brand.primary} />
              </View>
            )}
            <View style={s.photoBadge}>
              <Icon name={photoUri ? 'edit' : 'plus'} size={13} color={Colors.brand.onPrimary} />
            </View>
            {/* 삭제는 편집(연필)과 같은 층위 — 썸네일 위 반대쪽 모서리에 둔다.
                아래에 '사진 지우기' 링크로 두면 사진이 있을 때만 레이아웃이 밀린다. */}
            {photoUri && (
              <TouchableOpacity
                style={s.photoRemoveBtn}
                onPress={() => setPhotoUri(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="사진 삭제"
              >
                <Icon name="close" size={13} color={Colors.text.inverse} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          <Text style={s.photoHint}>사진 (선택)</Text>
        </View>

        {/* 이름 (필수) */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>이름</Text>
          <TextInput
            style={[s.textInput, ((nameTouched && !name.trim()) || nameBlocked) && s.textInputError]}
            placeholder="예: 보리, 초코, 몽이"
            placeholderTextColor={Colors.text.tertiary}
            value={name}
            onChangeText={(t) => { setName(t); if (nameBlocked) setNameBlocked(false); }}
            onBlur={() => setNameTouched(true)}
            maxLength={20}
            accessibilityLabel="강아지 이름"
            returnKeyType="next"
          />
          {/* 검증 메시지는 입력 필드에 붙인다 — 예전엔 하단 버튼 라벨이 '이름을 입력해주세요'로
              바뀌어, 어디를 고쳐야 하는지 알려주지 못했다. */}
          {nameTouched && !name.trim() ? (
            <Text style={s.fieldError}>이름을 입력해주세요</Text>
          ) : nameBlocked ? (
            <Text style={s.fieldError}>{MODERATION_BLOCK_MESSAGE}</Text>
          ) : (
            <Text style={s.fieldHint}>
              이 이름이 다른 보호자에게 보이는 식별자가 돼요. 닉네임처럼 활용돼요.
            </Text>
          )}
        </View>

        {/* 한 줄 소개 (선택) */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>한 줄 소개 (선택)</Text>
          <TextInput
            style={[s.textInput, s.textInputMulti, bioBlocked && s.textInputError]}
            placeholder="예: 낯은 가리지만 냄새 맡는 건 좋아해요"
            placeholderTextColor={Colors.text.tertiary}
            value={bio}
            onChangeText={(t) => { setBio(t); if (bioBlocked) setBioBlocked(false); }}
            maxLength={80}
            multiline
            accessibilityLabel="강아지 한 줄 소개"
          />
          {bioBlocked
            ? <Text style={s.fieldError}>{MODERATION_BLOCK_MESSAGE}</Text>
            : <Text style={s.fieldHint}>{bio.length}/80</Text>}
        </View>

        {/* 품종 + 체중 — 한 줄 (선택) */}
        <View style={s.fieldRow}>
          <View style={s.fieldHalf}>
            <Text style={s.fieldLabel}>품종 (선택)</Text>
            <TextInput
              style={s.textInput}
              placeholder="예: 말티즈"
              placeholderTextColor={Colors.text.tertiary}
              value={breed}
              onChangeText={setBreed}
              maxLength={30}
              accessibilityLabel="강아지 품종, 선택사항"
              returnKeyType="next"
            />
          </View>
          <View style={s.fieldHalf}>
            <Text style={s.fieldLabel}>체중 (선택)</Text>
            <TextInput
              style={[s.textInput, !!weightError && s.textInputError]}
              placeholder="예: 4.5"
              placeholderTextColor={Colors.text.tertiary}
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              maxLength={5}
              accessibilityLabel="강아지 체중, 킬로그램, 선택사항"
              returnKeyType="done"
            />
            {!!weightError && <Text style={s.fieldError}>{weightError}</Text>}
          </View>
        </View>

        {/* 크기 */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>크기</Text>
          <View style={s.chipRow}>
            {SIZES.map(sz => (
              <TouchableOpacity
                key={sz}
                style={[s.chip, size === sz && s.chipSelected]}
                onPress={() => { Keyboard.dismiss(); setSize(sz); }}
              >
                <Text style={[s.chipText, size === sz && s.chipTextSelected]}>{sizeLabel[sz]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 나이대 */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>나이대</Text>
          <View style={s.chipRow}>
            {AGE_GROUPS.map(ag => (
              <TouchableOpacity
                key={ag}
                style={[s.chip, ageGroup === ag && s.chipSelected]}
                onPress={() => { Keyboard.dismiss(); setAgeGroup(ag); }}
              >
                <Text style={[s.chipText, ageGroup === ag && s.chipTextSelected]}>{ageGroupLabel[ag]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 기질 */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>기질 (선택)</Text>
          <View style={s.chipRow}>
            {TEMPERAMENT_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[s.chip, selectedTemperament.includes(key) && s.chipSelected]}
                onPress={() => toggleItem(selectedTemperament, key, setSelectedTemperament)}
              >
                <Text style={[s.chipText, selectedTemperament.includes(key) && s.chipTextSelected]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 산책 스타일 */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>산책 스타일 (선택)</Text>
          <View style={s.chipRow}>
            {WALKING_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[s.chip, selectedWalking.includes(key) && s.chipSelected]}
                onPress={() => toggleItem(selectedWalking, key, setSelectedWalking)}
              >
                <Text style={[s.chipText, selectedWalking.includes(key) && s.chipTextSelected]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: Spacing[40] }} />
      </ScrollView>

      {/* 하단 CTA — 장소 상세와 같은 비율 규칙(보조 1 : 주 2).
          온보딩에서는 되돌아갈 화면이 없어(replace 진입) 취소를 두지 않는다.
          그 경우의 이탈구는 상단 '건너뛰기'다. */}
      <View style={s.footer}>
        {!isOnboarding && (
          <Button
            label="취소"
            onPress={handleCancel}
            variant="secondary"
            size="l"
            disabled={isSaving}
            style={s.footerCancel}
          />
        )}
        <Button
          label={isSaving ? '등록 중...' : '강아지 등록하기'}
          onPress={handleDone}
          variant="primary"
          size="l"
          fullWidth={isOnboarding}
          style={isOnboarding ? undefined : s.footerPrimary}
          disabled={!canProceed}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20] },

  // 헤더 (우측 상단 건너뛰기)
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
  },
  skipBtn: { paddingHorizontal: Spacing[8], paddingVertical: Spacing[8] },
  skipText: { ...Typography.label.m, color: Colors.text.tertiary, fontWeight: '600' },

  // 타이틀 + Optional 배지
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[8], marginBottom: Spacing[6] },
  title: { ...Typography.display.s, color: Colors.text.primary },
  optionalBadge: {
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  optionalBadgeText: { ...Typography.caption, color: Colors.text.tertiary, fontWeight: '600' },

  desc: { ...Typography.body.m, color: Colors.text.secondary, marginBottom: Spacing[24], lineHeight: 22 },


  field: { marginBottom: Spacing[20] },
  fieldRow: { flexDirection: 'row', gap: Spacing[10], marginBottom: Spacing[20] },
  fieldHalf: { flex: 1 },
  fieldLabel: { ...Typography.label.l, color: Colors.text.primary, marginBottom: Spacing[10] },
  fieldHint: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[6], lineHeight: 16 },

  textInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border.subtle,
    borderRadius: Radius.l,
    paddingHorizontal: Spacing[14],
    ...Typography.body.m,
    color: Colors.text.primary,
    backgroundColor: Colors.surface.default,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[8] },
  chip: {
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[8],
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1.5,
    borderColor: Colors.border.subtle,
  },
  chipSelected: {
    backgroundColor: Colors.brand.subtle,
    borderColor: Colors.brand.primary,
  },
  chipText: { ...Typography.label.m, color: Colors.text.secondary },
  chipTextSelected: { color: Colors.brand.primary, fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    gap: Spacing[8],
    padding: Spacing[16],
    paddingBottom: Spacing[32],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.bg.primary,
  },
  // 보조 1 : 주 2 — 장소 상세 하단 CTA와 같은 비율 규칙
  footerCancel:  { flex: 1 },
  footerPrimary: { flex: 2 },

  // ── 사진 (선택) ────────────────────────────────────────────
  photoBlock: {
    alignItems: 'center',
    gap: Spacing[6],
    marginBottom: Spacing[20],
  },
  photoPicker: { width: 96, height: 96 },
  photoPreview: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.bg.tertiary,
  },
  photoPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brand.subtle,
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
    borderStyle: 'dashed',
  },
  photoBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brand.primary,
    borderWidth: 2.5, borderColor: Colors.bg.primary,
  },
  photoRemoveBtn: {
    position: 'absolute', right: -2, top: -2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.text.primary,
    borderWidth: 2.5, borderColor: Colors.bg.primary,
  },
  photoHint:   { ...Typography.caption, color: Colors.text.tertiary },

  // 입력 검증
  textInputError: { borderColor: Colors.status.error.text },
  fieldError: {
    ...Typography.caption,
    color: Colors.status.error.text,
    marginTop: Spacing[6],
  },
  textInputMulti: { minHeight: 64, textAlignVertical: 'top', paddingTop: Spacing[12] },
});
