import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, SafeAreaView,
} from 'react-native';
import { notify } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/common/Button';
import type { DogSize, DogAgeGroup, Dog } from '../../src/types';
import { sizeLabel, ageGroupLabel } from '../../src/utils/labels';

import { IS_REAL_AUTH } from '../../src/config/env';

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

  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [size, setSize] = useState<DogSize>('small');
  const [ageGroup, setAgeGroup] = useState<DogAgeGroup>('adult');
  const [selectedTemperament, setSelectedTemperament] = useState<string[]>([]);
  const [selectedWalking, setSelectedWalking] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 가입 funnel 진입 추적 (마운트 시점 1회)
  useEffect(() => {
    track(EVENT.dog_profile_create_started, { screen_name: 'dog_setup' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleItem = (arr: string[], key: string, setter: (v: string[]) => void) => {
    if (arr.includes(key)) setter(arr.filter(i => i !== key));
    else setter([...arr, key]);
  };

  const handleDone = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);

    const weightNum = weightKg.trim() ? parseFloat(weightKg) : undefined;
    const weightValid = weightNum === undefined || (!Number.isNaN(weightNum) && weightNum > 0 && weightNum < 100);
    if (!weightValid) {
      notify('체중은 0보다 크고 100kg 미만의 숫자로 입력해주세요.', '체중 확인');
      setIsSaving(false);
      return;
    }

    if (IS_REAL_AUTH && user) {
      // 실 환경: Supabase dogs 테이블에 저장 → DB 생성 UUID 사용
      const { data, error } = await supabase
        .from('dogs')
        .insert({
          user_id: user.user_id,
          name: name.trim(),
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
        notify('강아지 등록에 실패했어요. 잠시 후 다시 시도해주세요.', '등록 실패');
        setIsSaving(false);
        return;
      }

      const newDog: Dog = {
        dog_id: data.dog_id,
        user_id: data.user_id,
        name: data.name,
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
      has_weight: !!weightNum,
      temperament_count: selectedTemperament.length,
      walking_count: selectedWalking.length,
    });
    // 등록 완료 후 권한 안내 단계로 (위치 + 알림)
    router.replace('/(auth)/permissions');
  };

  // 강아지 등록 건너뛰기 — 마이 탭에서 언제든 추가 가능
  const handleSkip = () => {
    completeOnboarding();
    router.replace('/(auth)/permissions');
  };

  const canProceed = name.trim().length > 0 && !isSaving;

  return (
    <SafeAreaView style={s.safe}>
      {/* 헤더 — 우측 상단 건너뛰기 */}
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleSkip} style={s.skipBtn} hitSlop={8} disabled={isSaving}>
          <Text style={s.skipText}>건너뛰기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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

        {/* 이름 */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>이름</Text>
          <TextInput
            style={s.textInput}
            placeholder="예: 보리, 초코, 몽이"
            placeholderTextColor={Colors.text.tertiary}
            value={name}
            onChangeText={setName}
            maxLength={20}
          />
          <Text style={s.fieldHint}>
            이 이름이 다른 보호자에게 보이는 식별자가 돼요. 닉네임처럼 활용돼요.
          </Text>
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
            />
          </View>
          <View style={s.fieldHalf}>
            <Text style={s.fieldLabel}>체중 (선택)</Text>
            <TextInput
              style={s.textInput}
              placeholder="예: 4.5"
              placeholderTextColor={Colors.text.tertiary}
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              maxLength={5}
            />
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
                onPress={() => setSize(sz)}
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
                onPress={() => setAgeGroup(ag)}
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

      <View style={s.footer}>
        <Button
          label={isSaving ? '등록 중...' : canProceed ? '등록하고 시작' : '이름을 입력해주세요'}
          onPress={handleDone}
          variant="primary"
          size="l"
          fullWidth
          disabled={!canProceed}
        />
        <TouchableOpacity onPress={handleSkip} style={s.skipLater} disabled={isSaving} activeOpacity={0.7}>
          <Text style={s.skipLaterText}>나중에 등록할게요</Text>
        </TouchableOpacity>
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

  // 하단 보조 — 나중에 등록
  skipLater: {
    alignItems: 'center',
    paddingVertical: Spacing[12],
    marginTop: Spacing[6],
  },
  skipLaterText: {
    ...Typography.label.m,
    color: Colors.text.tertiary,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

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
    padding: Spacing[16],
    paddingBottom: Spacing[32],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.bg.primary,
  },
});
