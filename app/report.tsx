/**
 * 신고 화면 (App Store 1.2 UGC 정책 필수)
 *
 * 라우팅 파라미터:
 *   target_type: 'spot' | 'checkin' | 'dog' | 'user' | 'checkin_photo'
 *   target_id: string
 *     checkin_photo는 checkin_photos.id — 장소 상세 갤러리에서 사진을 길게 눌러 들어온다.
 *     사진은 사전 검수 없이 공개되므로 이 경로가 사후 안전장치다.
 *
 * 신고 사유 선택 + 상세 입력 → reportContent 액션 호출.
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { toast } from '../src/utils/toast';
import { OK } from '../src/constants/messages';
import { track, EVENT } from '../src/utils/analytics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import type { ReportReason, ReportTargetType } from '../src/types';

const REASONS: { key: ReportReason; label: string; desc: string }[] = [
  { key: 'inappropriate_content', label: '부적절한 콘텐츠', desc: '음란·폭력·혐오 등 불쾌한 내용' },
  { key: 'harassment',            label: '괴롭힘·혐오 표현', desc: '특정인을 향한 비방, 공격, 협박' },
  { key: 'animal_abuse',          label: '동물 학대',       desc: '동물을 해치는 콘텐츠' },
  { key: 'spam',                  label: '스팸·광고',       desc: '반복적인 홍보, 무관한 링크' },
  { key: 'misinformation',        label: '잘못된 정보',     desc: '폐쇄된 장소, 잘못된 위치 등' },
  { key: 'privacy_violation',     label: '개인정보 침해',   desc: '본인 동의 없는 사진·정보 노출' },
  { key: 'other',                 label: '기타',            desc: '상세 내용을 적어주세요' },
];

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    target_type?: string;
    target_id?: string;
    /** user/dog 타깃일 때 차단 옵션을 위한 부가 정보 */
    user_id?: string;
    dog_id?: string;
    dog_name?: string;         // 차단 목록 표시용
    dog_avatar_url?: string;
  }>();
  const blockMeta = { name: params.dog_name, avatar_url: params.dog_avatar_url };
  const reportContent = useAppStore(s => s.reportContent);
  const blockUser     = useAppStore(s => s.blockUser);

  const targetType = (params.target_type as ReportTargetType) || 'spot';
  const targetId   = params.target_id || '';
  // 차단 옵션은 dog/user/checkin(작성자)일 때만 의미 있음 — spot은 제외
  const canHide    = targetType === 'dog' || targetType === 'user' || targetType === 'checkin';

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoHide, setAlsoHide] = useState(true); // 기본 체크: 사용자가 신고할 정도면 보통 안 보고 싶음
  const submittedRef = useRef(false);

  const submit = () => {
    // 사유 미선택이면 버튼 자체가 비활성이다 — 이유는 버튼 위 안내문이 상시로 설명한다
    if (!reason) return;
    if (!targetId) {
      toast.error('신고 대상을 확인할 수 없어요');
      return;
    }
    if (submittedRef.current) return; // 더블탭 이중 신고·이중 back 방지
    submittedRef.current = true;
    reportContent(targetType, targetId, reason, detail.trim() || undefined);
    // 대상 유형에 따라 이벤트 분기 (place vs photo)
    track(targetType === 'spot' ? EVENT.report_place_submitted : EVENT.report_photo_submitted, {
      screen_name: 'report',
      place_id: targetType === 'spot' ? targetId : undefined,
      target_type: targetType,
      reason,
    });

    // 신고와 함께 "더 안 보기" 선택했으면 작성자 차단
    //   - user 타깃: target_id가 user_id
    //   - dog 타깃: target_id가 dog_id (user_id도 params로 받을 수 있음)
    //   - checkin 타깃: 작성자의 user_id/dog_id가 params로 전달돼야 함
    let hidden = false;
    if (canHide && alsoHide) {
      try {
        if (targetType === 'user') {
          blockUser(targetId);
          hidden = true;
        } else if (targetType === 'dog') {
          // dog 단위 차단 — user_id 알면 같이 전달, 표시용 이름/아바타 보관
          blockUser(params.user_id ?? '', targetId, blockMeta);
          hidden = true;
        } else if (targetType === 'checkin' && (params.user_id || params.dog_id)) {
          blockUser(params.user_id ?? '', params.dog_id, blockMeta);
          hidden = true;
        }
      } catch {
        // 차단 실패는 신고 자체에 영향 없음
      }
    }

    // 확인을 누르게 하지 않는다 — 알려주기만 하면 되는 결과다(§2.1-3)
    toast.success(
      hidden
        ? '신고를 접수했어요. 이 사용자의 콘텐츠는 더 이상 보이지 않아요'
        : OK.report,
    );
    router.back();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="닫기">
          <Icon name="close" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>신고하기</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.lead}>어떤 점이 문제인가요?</Text>
          <Text style={s.sub}>접수된 신고는 24시간 내에 검토해 처리할게요.</Text>

          <View style={s.list}>
            {REASONS.map(r => {
              const selected = reason === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[s.row, selected && s.rowOn]}
                  onPress={() => setReason(r.key)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${r.label}. ${r.desc}`}
                >
                  <View style={[s.radio, selected && s.radioOn]}>
                    {selected && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{r.label}</Text>
                    <Text style={s.rowDesc}>{r.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {canHide && (
            <TouchableOpacity
              style={s.hideToggle}
              onPress={() => setAlsoHide(v => !v)}
              activeOpacity={0.85}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: alsoHide }}
            >
              <View style={[s.checkbox, alsoHide && s.checkboxOn]}>
                {alsoHide && <Icon name="check" size={14} color={Colors.brand.onPrimary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.hideToggleLabel}>
                  이 사용자의 콘텐츠를 더 이상 보지 않기
                </Text>
                <Text style={s.hideToggleDesc}>
                  차단 목록은 마이 → 차단한 사용자에서 해제할 수 있어요.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={s.detailLabel}>상세 내용 (선택)</Text>
          <TextInput
            style={s.input}
            value={detail}
            onChangeText={setDetail}
            placeholder="자세한 상황을 적어주시면 더 빠르게 검토할 수 있어요."
            placeholderTextColor={Colors.text.placeholder}
            multiline
            maxLength={500}
            textAlignVertical="top"
            accessibilityLabel="신고 상세 내용, 선택사항"
          />
          <Text style={s.counter}>{detail.length}/500</Text>
        </ScrollView>

        <View style={s.footer}>
          {/* 버튼이 왜 눌리지 않는지 알려준다 */}
          {!reason && <Text style={s.footerHint}>신고 사유를 선택하면 접수할 수 있어요</Text>}
          <TouchableOpacity
            style={[s.cta, !reason && s.ctaDisabled]}
            onPress={submit}
            disabled={!reason}
            activeOpacity={0.88}
          >
            <Text style={s.ctaLabel}>신고 접수</Text>
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

  lead: { ...Typography.title.l, color: Colors.text.primary, marginBottom: Spacing[6] },
  sub: { ...Typography.body.s, color: Colors.text.secondary, marginBottom: Spacing[20] },

  list: { gap: Spacing[8] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[12],
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[14],
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  rowOn: { borderColor: Colors.brand.primary, backgroundColor: Colors.surface.selected },
  rowLabel: { ...Typography.title.s, color: Colors.text.primary },
  rowDesc: { ...Typography.body.s, color: Colors.text.secondary, marginTop: 2 },

  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border.strong,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.brand.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand.primary },

  detailLabel: { ...Typography.label.l, color: Colors.text.primary, marginTop: Spacing[24], marginBottom: Spacing[8] },
  input: {
    minHeight: 120, padding: Spacing[14],
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
    ...Typography.body.m, color: Colors.text.primary,
  },
  counter: { ...Typography.caption, color: Colors.text.tertiary, textAlign: 'right', marginTop: Spacing[4] },

  footer: {
    paddingHorizontal: Spacing[20], paddingVertical: Spacing[16],
    borderTopWidth: 1, borderTopColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
  },
  cta: {
    height: 54, borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: Colors.border.strong },
  footerHint: {
    ...Typography.caption, color: Colors.text.secondary,
    textAlign: 'center', marginBottom: Spacing[10],
  },
  ctaLabel: { ...Typography.title.m, color: '#FFFFFF' },

  // ── 차단 옵션 체크박스 ──
  hideToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[12],
    marginTop: Spacing[20],
    padding: Spacing[14],
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.subtle,
  },
  checkbox: {
    width: 22, height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  hideToggleLabel: {
    ...Typography.label.l,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  hideToggleDesc: {
    ...Typography.label.s,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});
