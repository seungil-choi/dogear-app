/**
 * 대표 사진 제안 화면
 *
 * 라우팅 파라미터:
 *   spot_id: string
 *
 * 왜 '정보 수정 제안'에서 떼어냈나 (2026-09-05):
 *   원래 이 기능은 info-correction의 항목 하나였다. 그런데 그 화면은
 *   「어떤 정보가 **잘못됐나요**?」를 묻고, 「폐쇄/존재하지 않음」 같은 신고성
 *   항목을 나란히 놓는다. 사진을 나눠주려는 사람에게 잘못을 묻는 꼴이었다.
 *
 *   성격이 정반대다 —
 *     대표 사진 제안 = 기여. 이 장소를 더 좋게 만드는 일
 *     정보 수정 제안 = 오류 신고. 틀린 것을 알리는 일
 *   섞어두면 기여하려는 사람이 신고 화면에 들어온 느낌을 받는다.
 *
 * 저장은 여전히 edit_suggestions(field='photo')를 쓴다. 상태 전이·감사로그·
 * 어드민 처리 흐름이 이미 있어서 테이블을 새로 만들 이유가 없다. 어드민 화면에서만
 * 「장소 사진 제안」과 「정보 수정 제안」으로 갈라 보여준다.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { AppImage } from '../src/components/common/AppImage';
import { useAppStore } from '../src/store/useAppStore';
import { uploadImage } from '../src/lib/uploadImage';
import { stripExif } from '../src/lib/stripExif';
import { IS_REAL_AUTH } from '../src/config/env';
import { PERM, PHOTO } from '../src/constants/messages';
import { notify } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { track, EVENT } from '../src/utils/analytics';

export default function SuggestPhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spot_id?: string }>();
  const spotId = params.spot_id || '';
  const spots = useAppStore(s => s.spots);
  const suggestEdit = useAppStore(s => s.suggestEdit);

  const targetSpot = spots.find(s => s.spot_id === spotId);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!spotId && !!photoUri && !submitting;

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
    if (!canSubmit || !photoUri) return;
    setSubmitting(true);
    try {
      // 사진은 반드시 먼저 스토리지에 올린다. 로컬 file:// 경로를 그대로 넣으면
      // 다른 기기에서 열리지 않고, 승인 시 공개 커버로 복사돼 모두에게 깨진 이미지가 된다.
      // ⚠️ 새 장소 제안과 달리 업로드 실패 시 제안을 **중단**한다.
      //    사진이 곧 제안 내용이라, 사진 없이 접수하면 어드민이 볼 것이 없다.
      const proposedImageUrl = IS_REAL_AUTH
        ? (await uploadImage({ bucket: 'spot-suggestions', uri: photoUri })).url
        : photoUri;   // 데모 모드는 로컬 URI로 흐름만 확인

      await suggestEdit({
        spot_id: spotId,
        field: 'photo',
        proposed_value: '',
        reason: reason.trim() || undefined,
        proposed_image_url: proposedImageUrl,
      });
      track(EVENT.place_suggestion_submitted, {
        screen_name: 'suggest_photo',
        place_id: spotId,
        suggestion_type: 'photo',
      });
      toast.success('사진을 보내주셔서 고마워요. 운영자가 검토할게요');
      router.back();
    } catch {
      track(EVENT.place_suggestion_submit_failed, {
        screen_name: 'suggest_photo',
        place_id: spotId,
      });
      toast.error('사진을 보내지 못했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>대표 사진 제안</Text>
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
          {targetSpot && (
            <View style={s.targetCard}>
              <Icon name="location-filled" size={14} color={Colors.brand.primary} />
              <Text style={s.targetName} numberOfLines={1}>{targetSpot.name}</Text>
            </View>
          )}

          <Text style={s.lead}>이 장소를 잘 보여주는 사진을 나눠주세요</Text>
          {/* 무엇이 좋은 사진인지 먼저 말한다. 안 말하면 강아지 사진이 온다 —
              올려준 마음은 반갑지만 그 사진은 장소가 아니라 그 아이를 대표한다. */}
          <Text style={s.guide}>
            장소의 전경이 담긴 사진이 좋아요. 강아지나 사람이 크게 나온 사진은
            장소를 대표하기 어려워요. 검토 후 반영됩니다.
          </Text>

          {photoUri ? (
            <View style={s.previewWrap}>
              <AppImage source={{ uri: photoUri }} style={s.preview} resizeMode="cover" />
              <TouchableOpacity style={s.change} onPress={handlePickPhoto}>
                <Text style={s.changeText}>다른 사진 고르기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.pick} onPress={handlePickPhoto} activeOpacity={0.85}>
              <Icon name="camera" size={22} color={Colors.text.tertiary} />
              <Text style={s.pickText}>사진 고르기</Text>
            </TouchableOpacity>
          )}

          <Text style={s.fieldLabel}>한마디 (선택)</Text>
          <TextInput
            style={s.textInput}
            placeholder="예: 봄에 벚꽃이 예뻐요"
            placeholderTextColor={Colors.text.placeholder}
            value={reason}
            onChangeText={setReason}
            maxLength={200}
            multiline
          />
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.submit, !canSubmit && s.submitOff]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            <Text style={s.submitText}>
              {submitting ? '보내는 중...' : '사진 제안하기'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[8], paddingBottom: Spacing[8],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.label.l, fontWeight: '700' },

  scroll: { flex: 1 },
  content: { padding: Spacing[16], paddingBottom: Spacing[24] },

  targetCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    backgroundColor: Colors.bg.secondary, borderRadius: Radius.m,
    paddingHorizontal: Spacing[12], paddingVertical: Spacing[10],
    marginBottom: Spacing[16],
  },
  targetName: { ...Typography.label.m, color: Colors.text.primary, flex: 1 },

  lead: { ...Typography.title.s, fontWeight: '700', marginBottom: Spacing[6] },
  guide: {
    ...Typography.caption, color: Colors.text.tertiary,
    lineHeight: 19, marginBottom: Spacing[16],
  },

  pick: {
    height: 132, borderRadius: Radius.m, borderWidth: 1, borderStyle: 'dashed',
    borderColor: Colors.border.default, backgroundColor: Colors.bg.secondary,
    alignItems: 'center', justifyContent: 'center', gap: Spacing[6],
  },
  pickText: { ...Typography.label.m, color: Colors.text.tertiary },
  previewWrap: { gap: Spacing[8] },
  preview: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.m,
    backgroundColor: Colors.bg.secondary,
  },
  change: { alignSelf: 'flex-start', paddingVertical: Spacing[4] },
  changeText: { ...Typography.label.m, color: Colors.brand.primary },

  fieldLabel: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[20], marginBottom: Spacing[6] },
  textInput: {
    borderWidth: 1, borderColor: Colors.border.default, borderRadius: Radius.m,
    paddingHorizontal: Spacing[12], paddingVertical: Spacing[10],
    ...Typography.body.s, color: Colors.text.primary,
    minHeight: 72, textAlignVertical: 'top',
  },

  footer: {
    padding: Spacing[16],
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border.subtle,
  },
  submit: {
    backgroundColor: Colors.brand.primary, borderRadius: Radius.m,
    paddingVertical: Spacing[14], alignItems: 'center',
    minHeight: 48,   // 터치 타깃 최소치
  },
  submitOff: { backgroundColor: Colors.border.strong },
  submitText: { ...Typography.label.l, color: Colors.brand.onPrimary, fontWeight: '700' },
});
