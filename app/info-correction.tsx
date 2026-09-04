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
import { toast } from '../src/utils/toast';
import { track, EVENT } from '../src/utils/analytics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import * as ImagePicker from 'expo-image-picker';
import { AppImage } from '../src/components/common/AppImage';
import { uploadImage } from '../src/lib/uploadImage';
import { IS_REAL_AUTH } from '../src/config/env';
import { PERM, PHOTO } from '../src/constants/messages';
import { notify } from '../src/utils/dialog';
import { stripExif } from '../src/lib/stripExif';

type FieldKey = 'name' | 'category' | 'address' | 'closed' | 'other' | 'photo';

const FIELDS: { key: FieldKey; label: string; desc: string; needsValue: boolean }[] = [
  // 사진은 값 대신 이미지를 받는다 — needsValue는 텍스트 입력 여부를 뜻하므로 false다.
  { key: 'photo',    label: '대표 사진',       desc: '이 장소를 잘 보여주는 사진을 제안해요',   needsValue: false },
  { key: 'name',     label: '장소명',          desc: '이름이 다르거나 정확하지 않아요',         needsValue: true  },
  { key: 'category', label: '카테고리',        desc: '공원/산책로/쉼터 등 분류가 잘못됐어요',   needsValue: true  },
  { key: 'address',  label: '주소',            desc: '주소가 정확하지 않거나 위치가 달라요',    needsValue: true  },
  { key: 'closed',   label: '폐쇄/존재하지 않음', desc: '실제로 가보니 없는 곳이에요',         needsValue: false },
  { key: 'other',    label: '기타',            desc: '그 밖의 정보 수정 제안',                  needsValue: true  },
];

export default function InfoCorrectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spot_id?: string; field?: string }>();
  const spotId = params.spot_id || '';
  const spots = useAppStore(s => s.spots);
  const suggestEdit = useAppStore(s => s.suggestEdit);

  const targetSpot = spots.find(s => s.spot_id === spotId);

  // 장소 상세의 '대표 사진 제안하기'로 들어오면 항목을 미리 골라둔다.
  // 모르는 값이 오면 무시하고 평소대로 고르게 둔다.
  const preset = FIELDS.some(f => f.key === params.field) ? (params.field as FieldKey) : null;
  const [field, setField] = useState<FieldKey | null>(preset);
  const [proposedValue, setProposedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const selectedField = FIELDS.find(f => f.key === field);
  const canSubmit =
    field !== null &&
    !submitting &&
    spotId &&
    (!selectedField?.needsValue || proposedValue.trim().length > 0) &&
    // 사진 제안은 사진이 곧 제안 내용이다. 없으면 검토할 것이 없다(서버 제약도 같다).
    (field !== 'photo' || !!photoUri);

  // suggest-spot과 같은 흐름 — 권한 → 선택 → EXIF 제거.
  // 제안 사진은 검토를 거쳐 장소 페이지에 공개될 수 있으므로 촬영 좌표를 지우고 들고 간다.
  const handlePickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { notify(PERM.photo, '권한 필요'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],   // 장소 커버 비율
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(await stripExif(result.assets[0].uri));
      }
    } catch {
      toast.error(PHOTO.loadFailed);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !field) return;
    setSubmitting(true);
    try {
      // 사진은 반드시 먼저 스토리지에 올린다. 로컬 file:// 경로를 그대로 넣으면
      // 다른 기기에서 열리지 않고, 승인 시 공개 커버로 복사돼 모두에게 깨진 이미지가 된다.
      // ⚠️ 새 장소 제안과 달리 여기서는 업로드 실패 시 제안을 **중단**한다.
      //    사진이 곧 제안 내용이라, 사진 없이 접수하면 어드민이 볼 것이 없다.
      let proposedImageUrl: string | undefined;
      if (field === 'photo' && photoUri) {
        if (IS_REAL_AUTH) {
          proposedImageUrl = (await uploadImage({ bucket: 'spot-suggestions', uri: photoUri })).url;
        } else {
          proposedImageUrl = photoUri;   // 데모 모드는 로컬 URI로 흐름만 확인
        }
      }
      await suggestEdit({
        spot_id: spotId,
        field,
        proposed_value: selectedField?.needsValue ? proposedValue.trim() : '',
        reason: reason.trim() || undefined,
        proposed_image_url: proposedImageUrl,
      });
      track(EVENT.place_suggestion_submitted, {
        screen_name: 'info_correction',
        place_id: spotId,
        suggestion_type: field,
      });
      toast.success('수정 제안을 접수했어요. 운영자가 검토할게요');
      router.back();
    } catch {
      track(EVENT.place_suggestion_submit_failed, {
        screen_name: 'info_correction',
        place_id: spotId,
      });
      toast.error('제안을 보내지 못했어요. 잠시 후 다시 시도해주세요');
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

          {/* 사진 제안 — 이 화면에서 유일하게 값 대신 이미지를 받는다 */}
          {field === 'photo' && (
            <View style={s.field}>
              <Text style={s.sectionLabel}>제안할 사진</Text>
              {/* 무엇이 좋은 사진인지 먼저 말한다. 안 그러면 강아지 사진이 온다 —
                  올려주신 마음은 반갑지만 그 사진은 장소가 아니라 강아지를 대표한다. */}
              <Text style={s.photoGuide}>
                장소의 전경이 담긴 사진이 좋아요. 강아지나 사람이 크게 나온 사진은
                장소를 대표하기 어려워요. 검토 후 반영됩니다.
              </Text>
              {photoUri ? (
                <View style={s.photoPreviewWrap}>
                  <AppImage source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
                  <TouchableOpacity style={s.photoChange} onPress={handlePickPhoto}>
                    <Text style={s.photoChangeText}>다른 사진 고르기</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.photoPick} onPress={handlePickPhoto}>
                  <Icon name="camera" size={20} color={Colors.text.tertiary} />
                  <Text style={s.photoPickText}>사진 고르기</Text>
                </TouchableOpacity>
              )}
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
  photoGuide: {
    ...Typography.caption, color: Colors.text.tertiary,
    marginBottom: Spacing[10], lineHeight: 18,
  },
  photoPick: {
    height: 120, borderRadius: Radius.m, borderWidth: 1, borderStyle: 'dashed',
    borderColor: Colors.border.default, backgroundColor: Colors.bg.secondary,
    alignItems: 'center', justifyContent: 'center', gap: Spacing[6],
  },
  photoPickText: { ...Typography.label.m, color: Colors.text.tertiary },
  photoPreviewWrap: { gap: Spacing[8] },
  photoPreview: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.m,
    backgroundColor: Colors.bg.secondary,
  },
  photoChange: { alignSelf: 'flex-start', paddingVertical: Spacing[4] },
  photoChangeText: { ...Typography.label.m, color: Colors.brand.primary },
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
