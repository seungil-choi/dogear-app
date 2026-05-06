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
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Colors, Spacing, Radius, Typography, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import { supabase } from '../src/lib/supabase';
import { uploadImage, pathFromPublicUrl } from '../src/lib/uploadImage';

const IS_REAL_AUTH = process.env.EXPO_PUBLIC_DEV_SEED !== 'true';
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
  const { dog, dogs, setActiveDog, setDogs } = useAppStore();

  // ─── State — 반드시 조건부 return 이전에 선언해야 함 (Rules of Hooks) ───
  const [avatarUri, setAvatarUri] = useState<string | undefined>(dog?.avatar_url);
  const [name, setName] = useState(dog?.name ?? '');
  const [breed, setBreed] = useState(dog?.breed ?? '');
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

  // 활성 강아지가 바뀌면 폼 상태도 동기화 (Picker로 강아지 전환 시)
  useEffect(() => {
    if (!dog) return;
    setAvatarUri(dog.avatar_url);
    setName(dog.name ?? '');
    setBreed(dog.breed ?? '');
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
          <Text style={styles.emptyText}>강아지 정보를 불러올 수 없어요.</Text>
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
      Alert.alert('권한 필요', source === 'camera' ? '카메라 접근 권한이 필요해요.' : '사진 접근 권한이 필요해요.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  function handleAvatarPress() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['취소', '카메라로 찍기', '앨범에서 선택', '사진 삭제'], cancelButtonIndex: 0, destructiveButtonIndex: 3 },
        idx => {
          if (idx === 1) pickImage('camera');
          else if (idx === 2) pickImage('library');
          else if (idx === 3) setAvatarUri(undefined);
        },
      );
    } else {
      Alert.alert('프로필 사진', undefined, [
        { text: '취소', style: 'cancel' },
        { text: '카메라로 찍기',   onPress: () => pickImage('camera') },
        { text: '앨범에서 선택',   onPress: () => pickImage('library') },
        { text: '사진 삭제', style: 'destructive', onPress: () => setAvatarUri(undefined) },
      ]);
    }
  }

  // ─── 저장 ────────────────────────────────────────────
  async function handleSave() {
    if (!dog) return;

    // 1. 새 아바타가 로컬 URI(file:// 또는 blob:)이면 Storage 업로드
    let finalAvatarUrl = avatarUri;
    if (IS_REAL_AUTH && avatarUri && !avatarUri.startsWith('http')) {
      try {
        const oldPath = dog.avatar_url ? pathFromPublicUrl(dog.avatar_url, 'dog-avatars') : null;
        const result = await uploadImage({
          bucket: 'dog-avatars',
          uri: avatarUri,
          userId: dog.user_id,
          oldPath: oldPath ?? undefined,
        });
        finalAvatarUrl = result.url;
      } catch (e: any) {
        Alert.alert('업로드 실패', e.message ?? '사진 업로드에 실패했어요.');
        return;
      }
    }

    const updatedDog = {
      ...dog,
      avatar_url: finalAvatarUrl,
      name: name.trim() || dog.name,
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
          breed: updatedDog.breed ?? null,
          weight_kg: updatedDog.weight_kg ?? null,
          size: updatedDog.size,
          age_group: updatedDog.age_group,
          temperament_tags: updatedDog.temperament_tags,
          walking_style_tags: updatedDog.walking_style_tags,
        })
        .eq('dog_id', dog.dog_id);

      if (error) {
        Alert.alert('저장 실패', '프로필 저장에 실패했어요. 다시 시도해주세요.');
        return;
      }
    }

    setActiveDog(updatedDog);
    setDogs(dogs.map(d => (d.dog_id === dog.dog_id ? updatedDog : d)));
    router.back();
  }

  // ─── Render ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 수정</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} hitSlop={8}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <TouchableOpacity style={styles.avatarWrap} onPress={handleAvatarPress} activeOpacity={0.8}>
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
            <FieldRow label="이름">
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="강아지 이름"
                placeholderTextColor={Colors.text.placeholder}
                returnKeyType="next"
              />
            </FieldRow>
            <Divider />
            <FieldRow label="품종">
              <TextInput
                style={styles.input}
                value={breed}
                onChangeText={setBreed}
                placeholder="예: 말티즈"
                placeholderTextColor={Colors.text.placeholder}
                returnKeyType="next"
              />
            </FieldRow>
            <Divider />
            <FieldRow label="체중 (kg)">
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={setWeightKg}
                placeholder="예: 3.5"
                placeholderTextColor={Colors.text.placeholder}
                keyboardType="decimal-pad"
                returnKeyType="done"
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
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {walkingStyleLabels[key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>{children}</View>
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

  // 빈 상태
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Typography.body.m,
    color: Colors.text.tertiary,
  },
});
