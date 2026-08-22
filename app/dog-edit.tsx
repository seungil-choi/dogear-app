import React, { useState, useEffect } from 'react';
import { AppImage } from '../src/components/common/AppImage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { stripExif } from '../src/lib/stripExif';

import { Colors, Spacing, Radius, Typography, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import { supabase } from '../src/lib/supabase';
import { uploadImage, pathFromPublicUrl } from '../src/lib/uploadImage';
import { notify, actionSheet, confirm } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { isObjectionable, MODERATION_BLOCK_MESSAGE } from '../src/utils/moderation';
import { PERM, PHOTO } from '../src/constants/messages';
import { track, EVENT } from '../src/utils/analytics';

import { IS_REAL_AUTH } from '../src/config/env';
import {
  sizeLabel,
  ageGroupLabel,
  temperamentLabels,
  walkingStyleLabels,
} from '../src/utils/labels';
import type { DogSize, DogAgeGroup } from '../src/types';

// ─── 상수 ──────────────────────────────────────────────

const SIZE_OPTIONS: DogSize[] = ['small', 'medium', 'large'];
const AGE_OPTIONS: DogAgeGroup[] = ['puppy', 'adult', 'senior'];
const TEMPERAMENT_KEYS = Object.keys(temperamentLabels);
const WALKING_STYLE_KEYS = Object.keys(walkingStyleLabels);

// ─── 컴포넌트 ──────────────────────────────────────────────

export default function DogEditScreen() {
  const router = useRouter();
  // 선택자로 쪼개 구독한다. 통짜 useAppStore()는 스토어의 어떤 값이 바뀌어도 이 화면을
  // 다시 그린다 — 특히 currentLocation은 GPS가 갱신될 때마다 바뀌므로, 편집 중 내내
  // 폼 전체가 재렌더된다. (앱의 다른 화면은 모두 선택자를 쓰고 있었고 여기만 예외였다)
  const dog = useAppStore(s => s.dog);
  const dogs = useAppStore(s => s.dogs);
  const setActiveDog = useAppStore(s => s.setActiveDog);
  const setDogs = useAppStore(s => s.setDogs);
  const deleteDog = useAppStore(s => s.deleteDog);

  // ─── State — 반드시 조건부 return 이전에 선언해야 함 (Rules of Hooks) ───
  const [avatarUri, setAvatarUri] = useState<string | undefined>(dog?.avatar_url);
  const [name, setName] = useState(dog?.name ?? '');
  const [breed, setBreed] = useState(dog?.breed ?? '');
  const [bio, setBio] = useState(dog?.bio ?? '');
  const [weightKg, setWeightKg] = useState(
    dog?.weight_kg != null ? String(dog.weight_kg) : '',
  );
  const [size, setSize] = useState<DogSize>(dog?.size ?? 'small');
  const [ageGroup, setAgeGroup] = useState<DogAgeGroup>(dog?.age_group ?? 'adult');
  const [temperamentTags, setTemperamentTags] = useState<string[]>(
    dog?.temperament_tags ?? [],
  );
  const [walkingStyleTags, setWalkingStyleTags] = useState<string[]>(
    dog?.walking_style_tags ?? [],
  );
  const [saving, setSaving] = useState(false);
  /** 부적절 표현 차단 — 어느 칸이 문제인지 나눠서 알려준다 */
  const [blocked, setBlocked] = useState<{ name?: boolean; breed?: boolean; bio?: boolean }>({});

  // 체중은 선택이지만, 넣었다면 말이 되는 값이어야 한다(dog-setup과 같은 규칙)
  const weightError = (() => {
    if (!weightKg.trim()) return '';
    const w = parseFloat(weightKg);
    return (Number.isNaN(w) || w <= 0 || w >= 100) ? '0보다 크고 100kg 미만으로 입력해주세요' : '';
  })();

  // 활성 강아지가 바뀌면 폼 상태도 동기화 (Picker로 강아지 전환 시)
  useEffect(() => {
    if (!dog) return;
    setAvatarUri(dog.avatar_url);
    setName(dog.name ?? '');
    setBreed(dog.breed ?? '');
    setBio(dog.bio ?? '');
    setWeightKg(dog.weight_kg != null ? String(dog.weight_kg) : '');
    setSize(dog.size);
    setAgeGroup(dog.age_group);
    setTemperamentTags(dog.temperament_tags ?? []);
    setWalkingStyleTags(dog.walking_style_tags ?? []);
  }, [dog?.dog_id]);

  // dog이 없으면 빈 화면 (hooks 선언 이후에 조건부 return)
  if (!dog) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>강아지 정보를 불러오지 못했어요.{'\n'}잠시 후 다시 열어주세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── 태그 토글 헬퍼 ──────────────────────────────────
  function toggleTag(
    tag: string,
    current: string[],
    setter: (tags: string[]) => void,
  ) {
    if (current.includes(tag)) {
      setter(current.filter(t => t !== tag));
    } else {
      setter([...current, tag]);
    }
  }

  // ─── 사진 선택 ────────────────────────────────────────
  async function pickImage(source: 'camera' | 'library') {
    const permFn = source === 'camera'
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permFn();
    if (status !== 'granted') {
      notify(source === 'camera' ? '사진 촬영에는 카메라 권한이 필요해요.' : PERM.photo, '권한 필요');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });

    if (!result.canceled && result.assets[0]) {
      // 아바타는 '익숙한 강아지' 등으로 남에게 보인다 — 촬영 좌표를 지우고 들고 간다.
      setAvatarUri(await stripExif(result.assets[0].uri));
    }
  }

  async function handleAvatarPress() {
    const idx = await actionSheet('프로필 사진', [
      { label: '카메라로 찍기' },
      { label: '앨범에서 선택' },
      { label: '사진 삭제', destructive: true },
    ]);
    if (idx === 0) pickImage('camera');
    else if (idx === 1) pickImage('library');
    else if (idx === 2) setAvatarUri(undefined);
  }

  // ─── 저장 ────────────────────────────────────────────
  async function handleSave() {
    if (!dog) return;
    if (saving) return;            // 더블탭 이중 업로드·이중 back 방지

    // 0. UGC 텍스트 사전 필터 (Apple 1.2) — 이름/견종은 타인에게 노출되므로 부적절어 차단
    // 1.5 체중 검증 (dog-setup과 동일 규칙) — 잘못된 값이 로컬/서버에 desync로 남지 않도록
    // 둘 다 '지금 화면에서 고칠 수 있는 입력 문제' → 인라인으로 표시한다.
    const nextBlocked = {
      name:  isObjectionable(name),
      breed: isObjectionable(breed),
      bio:   isObjectionable(bio),
    };
    setBlocked(nextBlocked);
    if (nextBlocked.name || nextBlocked.breed || nextBlocked.bio || weightError) return;

    setSaving(true);
    try {

    // 1. 새 아바타가 로컬 URI(file:// 또는 blob:)이면 Storage 업로드
    let finalAvatarUrl = avatarUri;
    if (IS_REAL_AUTH && avatarUri && !avatarUri.startsWith('http')) {
      try {
        const oldPath = dog.avatar_url ? pathFromPublicUrl(dog.avatar_url, 'dog-avatars') : null;
        const result = await uploadImage({
          bucket: 'dog-avatars',
          uri: avatarUri,
          oldPath: oldPath ?? undefined,
        });
        finalAvatarUrl = result.url;
        // UGC 이미지 사후 모더레이션 큐 적재 (Apple 1.2) — 관리자 검수 대상. fire-and-forget
        supabase
          .from('media_moderation_queue')
          .insert({ content_type: 'dog_avatar', dog_id: dog.dog_id, image_url: result.url })
          .then(({ error }) => { if (error) console.error('moderation queue insert failed:', error); });
      } catch (e: any) {
        track(EVENT.photo_upload_failed, {
          screen_name: 'dog_edit',
          bucket: 'dog-avatars',
          error_message: (e?.message ?? 'unknown').slice(0, 100),
        });
        toast.error(PHOTO.uploadFailed);
        return;
      }
    }

    const updatedDog = {
      ...dog,
      avatar_url: finalAvatarUrl,
      name: name.trim() || dog.name,
      bio: bio.trim() || undefined,
      breed: breed.trim() || undefined,
      weight_kg: weightKg ? parseFloat(weightKg) : undefined,
      size,
      age_group: ageGroup,
      temperament_tags: temperamentTags,
      walking_style_tags: walkingStyleTags,
    };

    if (IS_REAL_AUTH) {
      const { error } = await supabase
        .from('dogs')
        .update({
          name: updatedDog.name,
          avatar_url: updatedDog.avatar_url ?? null,
          bio: updatedDog.bio ?? null,
          breed: updatedDog.breed ?? null,
          weight_kg: updatedDog.weight_kg ?? null,
          size: updatedDog.size,
          age_group: updatedDog.age_group,
          temperament_tags: updatedDog.temperament_tags,
          walking_style_tags: updatedDog.walking_style_tags,
        })
        .eq('dog_id', dog.dog_id);

      if (error) {
        toast.error('저장하지 못했어요. 잠시 후 다시 시도해주세요');
        return;
      }
    }

    setActiveDog(updatedDog);
    setDogs(dogs.map(d => (d.dog_id === dog.dog_id ? updatedDog : d)));
    router.back();
    } finally {
      setSaving(false);
    }
  }

  // ─── 강아지 삭제 ──────────────────────────────────────
  async function handleDelete() {
    if (!dog) return;

    // 마지막 강아지면 → DogEar는 강아지 없이 동작 안 함 → 계정 삭제로 안내
    if (dogs.length <= 1) {
      const goAccountDelete = await confirm(
        `${dog.name}만 등록된 상태예요. 강아지를 삭제하면 DogEar 사용이 어려워져요.\n계정 삭제 화면으로 이동할까요?`,
        {
          title: '마지막 강아지예요',
          confirmText: '계정 삭제로 이동',
        },
      );
      if (goAccountDelete) {
        router.push('/account-delete');
      }
      return;
    }

    // 일반 삭제 — 다른 강아지가 있는 경우
    const ok = await confirm(
      `${dog.name}의 발도장 기록과 단골 장소 정보가 함께 사라져요.\n30일 안에는 운영팀에 문의해 복구할 수 있어요.`,
      {
        title: `${dog.name}를 삭제할까요?`,
        confirmText: '삭제',
        destructive: true,
      },
    );
    if (!ok) return;

    const success = await deleteDog(dog.dog_id);
    if (!success) {
      toast.error('삭제하지 못했어요. 잠시 후 다시 시도해주세요');
      return;
    }
    // 삭제 확인은 confirm에서 이미 받았다 — 결과까지 모달로 막지 않는다
    toast.success(`${dog.name}를 삭제했어요`);
    router.back();
  }

  // ─── Render ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
        >
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">프로필 수정</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          hitSlop={8}
          disabled={saving}
          accessibilityLabel="저장"
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>{saving ? '저장 중…' : '저장'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 아바타 편집 ── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handleAvatarPress}
              activeOpacity={0.8}
              accessibilityLabel="프로필 사진 변경"
              accessibilityRole="button"
            >
              {avatarUri ? (
                <AppImage source={{ uri: avatarUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{dog.name[0]}</Text>
                </View>
              )}
              {/* 카메라 오버레이 배지 */}
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>탭하여 사진 변경</Text>
          </View>

          {/* ── 섹션 1: 기본 정보 ── */}
          <SectionCard title="기본 정보">
            <FieldRow label="이름" error={blocked.name ? MODERATION_BLOCK_MESSAGE : undefined}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(t) => { setName(t); if (blocked.name) setBlocked(b => ({ ...b, name: false })); }}
                placeholder="강아지 이름"
                placeholderTextColor={Colors.text.placeholder}
                returnKeyType="next"
                accessibilityLabel="강아지 이름"
              />
            </FieldRow>
            <Divider />
            <FieldRow label="한 줄 소개" error={blocked.bio ? MODERATION_BLOCK_MESSAGE : undefined}>
              <TextInput
                style={styles.input}
                value={bio}
                onChangeText={(t) => { setBio(t); if (blocked.bio) setBlocked(b => ({ ...b, bio: false })); }}
                placeholder="낯은 가리지만 냄새 맡는 건 좋아해요"
                placeholderTextColor={Colors.text.placeholder}
                maxLength={80}
                returnKeyType="next"
                accessibilityLabel="강아지 한 줄 소개"
              />
            </FieldRow>
            <Divider />
            <FieldRow label="품종" error={blocked.breed ? MODERATION_BLOCK_MESSAGE : undefined}>
              <TextInput
                style={styles.input}
                value={breed}
                onChangeText={(t) => { setBreed(t); if (blocked.breed) setBlocked(b => ({ ...b, breed: false })); }}
                placeholder="예: 말티즈"
                placeholderTextColor={Colors.text.placeholder}
                returnKeyType="next"
                accessibilityLabel="강아지 품종"
              />
            </FieldRow>
            <Divider />
            <FieldRow label="체중 (kg)" error={weightError || undefined}>
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={setWeightKg}
                placeholder="예: 3.5"
                placeholderTextColor={Colors.text.placeholder}
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel="강아지 체중, 킬로그램"
              />
            </FieldRow>
          </SectionCard>

          {/* ── 섹션 2: 크기 선택 ── */}
          <SectionCard title="크기">
            <View style={styles.optionRow}>
              {SIZE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionBtn, size === opt && styles.optionBtnActive]}
                  onPress={() => setSize(opt)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: size === opt }}
                  accessibilityLabel={`크기 ${sizeLabel[opt]}`}
                >
                  <Text
                    style={[styles.optionBtnText, size === opt && styles.optionBtnTextActive]}
                  >
                    {sizeLabel[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* ── 섹션 3: 나이대 선택 ── */}
          <SectionCard title="나이대">
            <View style={styles.optionRow}>
              {AGE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionBtn, ageGroup === opt && styles.optionBtnActive]}
                  onPress={() => setAgeGroup(opt)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ageGroup === opt }}
                  accessibilityLabel={`나이대 ${ageGroupLabel[opt]}`}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      ageGroup === opt && styles.optionBtnTextActive,
                    ]}
                  >
                    {ageGroupLabel[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* ── 섹션 4: 기질 태그 ── */}
          <SectionCard title="기질">
            <View style={styles.chipWrap}>
              {TEMPERAMENT_KEYS.map(key => {
                const active = temperamentTags.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleTag(key, temperamentTags, setTemperamentTags)}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={temperamentLabels[key]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {temperamentLabels[key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* ── 섹션 5: 산책 스타일 태그 ── */}
          <SectionCard title="산책 스타일">
            <View style={styles.chipWrap}>
              {WALKING_STYLE_KEYS.map(key => {
                const active = walkingStyleTags.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleTag(key, walkingStyleTags, setWalkingStyleTags)}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={walkingStyleLabels[key]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {walkingStyleLabels[key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* ── 위험 영역 — 강아지 삭제 ── */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <Icon name="trash" size={16} color={Colors.status.error.text} />
            <Text style={styles.deleteBtnText}>이 강아지 프로필 삭제</Text>
          </TouchableOpacity>

          {/* 하단 여백 */}
          <View style={{ height: Spacing[40] }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── 서브 컴포넌트 ──────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** 입력 오류는 해당 칸 바로 아래에 붙인다(§2.1-1) — 모달로 띄우면 어디를 고칠지 모른다 */
function FieldRow({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>
        {children}
        {!!error && <Text style={styles.fieldError}>{error}</Text>}
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── 스타일 ──────────────────────────────────────────────

const styles = StyleSheet.create({
  // 레이아웃
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.bg.secondary,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing[16],
    paddingBottom: Spacing[24],
  },

  // 헤더
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...Typography.title.m,
    color: Colors.text.primary,
  },
  saveBtn: {
    paddingHorizontal: Spacing[14],
    paddingVertical: Spacing[6],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.round,
  },
  saveBtnText: {
    ...Typography.label.m,
    color: Colors.brand.onPrimary,
  },

  // 섹션 카드
  sectionCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    padding: Spacing[16],
    marginBottom: Spacing[12],
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  sectionTitle: {
    ...Typography.title.s,
    color: Colors.text.primary,
    marginBottom: Spacing[12],
  },

  // 필드 행
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  fieldLabel: {
    ...Typography.label.l,
    color: Colors.text.secondary,
    width: 76,
  },
  fieldInput: {
    flex: 1,
  },
  fieldError: {
    ...Typography.label.s,
    color: Colors.status.error.text,
    marginTop: Spacing[4],
    letterSpacing: 0,
  },
  input: {
    ...Typography.body.l,
    color: Colors.text.primary,
    paddingVertical: Spacing[6],
    paddingHorizontal: 0,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: Colors.border.default,
    marginVertical: Spacing[4],
  },

  // 선택 버튼 (크기/나이대) — 가로 3개
  optionRow: {
    flexDirection: 'row',
    gap: Spacing[8],
  },
  optionBtn: {
    flex: 1,
    paddingVertical: Spacing[14],
    alignItems: 'center',
    borderRadius: Radius.s,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    backgroundColor: Colors.bg.secondary,
  },
  optionBtnActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primaryLight,
  },
  optionBtnText: {
    ...Typography.label.m,
    color: Colors.text.secondary,
  },
  optionBtnTextActive: {
    color: Colors.brand.primary,
    fontWeight: '600',
  },

  // 태그 칩
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[8],
  },
  chip: {
    paddingHorizontal: Spacing[14],
    paddingVertical: Spacing[8],
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    backgroundColor: Colors.bg.secondary,
  },
  chipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primary,
  },
  chipText: {
    ...Typography.label.m,
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: Colors.brand.onPrimary,
  },

  // 아바타 섹션
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing[24],
    gap: Spacing[8],
  },
  avatarWrap: {
    position: 'relative',
    width: 96, height: 96,
  },
  avatarImg: {
    width: 96, height: 96,
    borderRadius: 48,
    backgroundColor: Colors.brand.subtle,
  },
  avatarPlaceholder: {
    width: 96, height: 96,
    borderRadius: 48,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2, right: 2,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface.default,
  },
  avatarHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },

  // 위험 영역 — 강아지 삭제 버튼
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[8],
    marginTop: Spacing[16],
    paddingVertical: Spacing[14],
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.status.error.text,
    backgroundColor: Colors.surface.default,
  },
  deleteBtnText: {
    ...Typography.label.l,
    color: Colors.status.error.text,
    fontWeight: '600',
  },

  // 빈 상태
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Typography.body.m,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
