/**
 * 장소 정보 수정 제안 화면
 *
 * 어드민 IA "신고 > 정보 수정 제안" 큐로 들어가는 입력 채널.
 *
 * 라우팅 파라미터:
 *   spot_id: string
 *
 * 사용자는 어느 항목이 잘못되었는지 + 어떻게 수정해야 하는지 적어 제출.
 * 운영자는 어드민에서 기존 값 ↔ 제안 값을 비교 후 반영/반려.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { notify } from '../src/utils/dialog';
import { track, EVENT } from '../src/utils/analytics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';

type FieldKey = 'name' | 'category' | 'address' | 'closed' | 'other';

const FIELDS: { key: FieldKey; label: string; desc: string; needsValue: boolean }[] = [
  { key: 'name',     label: '장소명',          desc: '이름이 다르거나 정확하지 않아요',         needsValue: true  },
  { key: 'category', label: '카테고리',        desc: '공원/산책로/쉼터 등 분류가 잘못됐어요',   needsValue: true  },
  { key: 'address',  label: '주소',            desc: '주소가 정확하지 않거나 위치가 달라요',    needsValue: true  },
  { key: 'closed',   label: '폐쇄/존재하지 않음', desc: '실제로 가보니 없는 곳이에요',         needsValue: false },
  { key: 'other',    label: '기타',            desc: '그 밖의 정보 수정 제안',                  needsValue: true  },
];

export default function InfoCorrectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spot_id?: string }>();
  const spotId = params.spot_id || '';
  const spots = useAppStore(s => s.spots);
  const suggestEdit = useAppStore(s => s.suggestEdit);

  const targetSpot = spots.find(s => s.spot_id === spotId);

  const [field, setField] = useState<FieldKey | null>(null);
  const [proposedValue, setProposedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedField = FIELDS.find(f => f.key === field);
  const canSubmit =
    field !== null &&
    !submitting &&
    spotId &&
    (!selectedField?.needsValue || proposedValue.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || !field) return;
    setSubmitting(true);
    try {
      await suggestEdit({
        spot_id: spotId,
        field,
        proposed_value: selectedField?.needsValue ? proposedValue.trim() : '',
        reason: reason.trim() || undefined,
      });
      track(EVENT.place_suggestion_submitted, {
        screen_name: 'info_correction',
        place_id: spotId,
        suggestion_type: field,
      });
      notify('운영자 검토 후 반영 여부를 결정해요. 감사합니다.', '제안 접수 완료');
      router.back();
    } catch {
      track(EVENT.place_suggestion_submit_failed, {
        screen_name: 'info_correction',
        place_id: spotId,
      });
      notify('제안 제출에 실패했어요. 잠시 후 다시 시도해주세요.', '제출 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>정보 수정 제안</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 대상 장소 */}
          {targetSpot && (
            <View style={s.targetCard}>
              <Icon name="location-filled" size={14} color={Colors.brand.primary} />
              <Text style={s.targetName} numberOfLines={1}>{targetSpot.name}</Text>
            </View>
          )}

          {/* 어떤 정보 */}
          <Text style={s.sectionLabel}>어떤 정보가 잘못됐나요?</Text>
          <View style={s.fieldList}>
            {FIELDS.map(f => {
              const selected = field === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[s.fieldRow, selected && s.fieldRowSelected]}
                  onPress={() => setField(f.key)}
                  activeOpacity={0.85}
                >
                  <View style={[s.radio, selected && s.radioOn]}>
                    {selected && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.fieldLabel, selected && s.fieldLabelSelected]}>{f.label}</Text>
                    <Text style={s.fieldDesc}>{f.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 제안 값 */}
          {selectedField?.needsValue && (
            <View style={s.field}>
              <Text style={s.sectionLabel}>올바른 값</Text>
              <TextInput
                style={s.textInput}
                placeholder={
                  field === 'name'     ? '예: 망원한강공원' :
                  field === 'address'  ? '예: 서울특별시 마포구 마포나루길 467' :
                  field === 'category' ? '예: 수변공원 / 어린이공원' :
                  '수정 내용을 적어주세요'
                }
                placeholderTextColor={Colors.text.tertiary}
                value={proposedValue}
                onChangeText={setProposedValue}
                maxLength={120}
              />
            </View>
          )}

          {/* 추가 사유 */}
          <View style={s.field}>
            <Text style={s.sectionLabel}>추가 설명 (선택)</Text>
            <TextInput
              style={[s.textInput, s.textArea]}
              placeholder="예: 표지판 사진을 봤어요 / 주변에서 자주 지나가는데 ..."
              placeholderTextColor={Colors.text.tertiary}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={s.charCount}>{reason.length} / 300</Text>
          </View>

          <Text style={s.note}>
            제안 내용은 운영자가 검토 후 반영해요. 거짓 신고가 반복되면 사용에 제한이 생길 수 있어요.
          </Text>
        </ScrollView>

        {/* CTA */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.cta, !canSubmit && s.ctaDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.88}
          >
            <Text style={s.ctaLabel}>{submitting ? '제출 중...' : '제안하기'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: 40 },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  targetCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.l,
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[10],
    borderWidth: 1, borderColor: Colors.border.brand,
    marginBottom: Spacing[20],
  },
  targetName: { flex: 1, ...Typography.label.m, color: Colors.brand.primary, fontWeight: '700' },

  sectionLabel: { ...Typography.label.l, color: Colors.text.primary, marginBottom: Spacing[10], fontWeight: '700' },

  fieldList: { gap: Spacing[8], marginBottom: Spacing[24] },
  fieldRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[12],
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[12],
    borderRadius: Radius.l,
    borderWidth: 1.5, borderColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
  },
  fieldRowSelected: { borderColor: Colors.brand.primary, backgroundColor: Colors.brand.subtle },
  fieldLabel: { ...Typography.label.l, color: Colors.text.primary },
  fieldLabelSelected: { color: Colors.brand.primary, fontWeight: '700' },
  fieldDesc: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2 },

  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border.strong,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: { borderColor: Colors.brand.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand.primary },

  field: { marginBottom: Spacing[20] },
  textInput: {
    height: 48,
    borderWidth: 1.5, borderColor: Colors.border.subtle,
    borderRadius: Radius.l,
    paddingHorizontal: Spacing[14],
    ...Typography.body.m,
    color: Colors.text.primary,
    backgroundColor: Colors.surface.default,
  },
  textArea: {
    height: 100,
    paddingTop: Spacing[12],
    paddingBottom: Spacing[12],
  },
  charCount: { ...Typography.caption, color: Colors.text.tertiary, textAlign: 'right', marginTop: 4 },

  note: { ...Typography.caption, color: Colors.text.tertiary, lineHeight: 16, marginTop: Spacing[8] },

  footer: {
    paddingHorizontal: Spacing[20], paddingVertical: Spacing[16],
    borderTopWidth: 1, borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.bg.primary,
  },
  cta: {
    height: 54, borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: Colors.border.strong },
  ctaLabel: { ...Typography.title.m, color: '#FFFFFF' },
});
