import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Button } from '../../src/components/common/Button';
import type { DogSize, DogAgeGroup } from '../../src/types';
import { sizeLabel, ageGroupLabel } from '../../src/utils/labels';

const SIZES: DogSize[] = ['small', 'medium', 'large'];
const AGE_GROUPS: DogAgeGroup[] = ['puppy', 'adult', 'senior'];

const TEMPERAMENT_OPTIONS = ['활발해요', '조용해요', '낯가려요', '사교적이에요', '겁이 많아요', '용감해요'];
const WALKING_OPTIONS = ['짧게 자주', '길게 천천히', '냄새 탐색', '달리기 좋아함', '특정 루트 선호'];

export default function DogSetupScreen() {
  const router = useRouter();
  const completeOnboarding = useAppStore(s => s.completeOnboarding);

  const [name, setName] = useState('');
  const [size, setSize] = useState<DogSize>('small');
  const [ageGroup, setAgeGroup] = useState<DogAgeGroup>('adult');
  const [selectedTemperament, setSelectedTemperament] = useState<string[]>([]);
  const [selectedWalking, setSelectedWalking] = useState<string[]>([]);

  const toggleItem = (arr: string[], item: string, set: (v: string[]) => void) => {
    if (arr.includes(item)) set(arr.filter(i => i !== item));
    else set([...arr, item]);
  };

  const handleDone = () => {
    // 실제 구현 시 store action으로 dog 저장
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const canProceed = name.trim().length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>반려견을 소개해주세요</Text>
        <Text style={s.desc}>산책 스팟 추천과 익숙한 강아지 필터에 활용돼요.</Text>

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
            {TEMPERAMENT_OPTIONS.map(t => (
              <TouchableOpacity
                key={t}
                style={[s.chip, selectedTemperament.includes(t) && s.chipSelected]}
                onPress={() => toggleItem(selectedTemperament, t, setSelectedTemperament)}
              >
                <Text style={[s.chipText, selectedTemperament.includes(t) && s.chipTextSelected]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 산책 스타일 */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>산책 스타일 (선택)</Text>
          <View style={s.chipRow}>
            {WALKING_OPTIONS.map(w => (
              <TouchableOpacity
                key={w}
                style={[s.chip, selectedWalking.includes(w) && s.chipSelected]}
                onPress={() => toggleItem(selectedWalking, w, setSelectedWalking)}
              >
                <Text style={[s.chipText, selectedWalking.includes(w) && s.chipTextSelected]}>{w}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: Spacing[40] }} />
      </ScrollView>

      <View style={s.footer}>
        <Button
          label={canProceed ? '완료' : '이름을 입력해주세요'}
          onPress={handleDone}
          variant="primary"
          size="l"
          fullWidth
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

  title: { ...Typography.display.s, color: Colors.text.primary, marginBottom: Spacing[6] },
  desc: { ...Typography.body.m, color: Colors.text.secondary, marginBottom: Spacing[24] },

  field: { marginBottom: Spacing[20] },
  fieldLabel: { ...Typography.label.l, color: Colors.text.primary, marginBottom: Spacing[10] },

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
