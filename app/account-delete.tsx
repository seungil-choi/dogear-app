/**
 * 계정 관리 화면
 *
 * 진입: 설정 > 계정 관리
 * 구조: 계정 정보 확인 → 하단 위험 영역(계정 삭제)
 * 계정 삭제는 별도 확인 Alert + "삭제" 입력 후 실행 (App Store 5.1.1(v) 필수)
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import { supabase } from '../src/lib/supabase';
import { notify, confirm as dialogConfirm } from '../src/utils/dialog';

import { IS_REAL_AUTH } from '../src/config/env';

const CONFIRM_WORD = '삭제';

const LOSS_ITEMS = [
  '모든 발도장 기록',
  '단골 장소 및 방문 횟수 기록',
  '강아지 프로필과 성향 태그',
  '저장해둔 장소 목록',
  '자주 마주친 강아지 데이터',
];

export default function AccountManageScreen() {
  const router     = useRouter();
  const user       = useAppStore(s => s.user);
  const deleteAccount = useAppStore(s => s.deleteAccount);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm,    setConfirm]    = useState('');
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = confirm.trim() === CONFIRM_WORD;

  const onConfirm = async () => {
    if (!canSubmit) return;
    const ok = await dialogConfirm('삭제 후에는 데이터를 복구할 수 없어요.', {
      title: '정말 삭제할까요?',
      confirmText: '계정 삭제',
      destructive: true,
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await deleteAccount(reason.trim() || undefined);
      // 실 환경: Supabase 세션도 만료
      if (IS_REAL_AUTH) {
        await supabase.auth.signOut();
      }
      router.replace('/(auth)/login');
    } catch {
      notify('계정 삭제 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.', '오류');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>계정 관리</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* ── 계정 정보 ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>로그인 정보</Text>
            <View style={s.infoCard}>
              <View style={s.infoRow}>
                <Icon name="person" size={16} color={Colors.text.tertiary} />
                <Text style={s.infoText}>{user ? providerLabel(user.login_type) + ' 로그인' : '게스트 계정'}</Text>
              </View>
            </View>
          </View>

          {/* ── 계정 삭제 ── */}
          <View style={[s.section, { marginTop: Spacing[32] }]}>
            <Text style={s.dangerLabel}>계정 삭제</Text>
            <Text style={s.dangerDesc}>삭제하면 발도장과 단골 장소 등 모든 기록이 사라지고, 되돌릴 수 없어요.</Text>

            {!deleteOpen ? (
              /* 삭제 진입 버튼 */
              <TouchableOpacity
                style={s.dangerTrigger}
                onPress={() => setDeleteOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={s.dangerTriggerText}>계정 삭제하기</Text>
                <Icon name="forward" size={16} color={Colors.text.tertiary} />
              </TouchableOpacity>
            ) : (
              /* 삭제 확인 폼 */
              <View style={s.deleteForm}>
                <View style={s.warnCard}>
                  <Icon name="warning" size={18} color={Colors.status.error.text} />
                  <Text style={s.warnText}>
                    계정을 삭제하면 아래 정보가 모두 사라지고, 되돌릴 수 없어요.
                  </Text>
                </View>

                {/* 손실 데이터 목록 */}
                <View style={s.lossList}>
                  {LOSS_ITEMS.map((item, i) => (
                    <View key={i} style={s.lossRow}>
                      <View style={s.lossDot} />
                      <Text style={s.lossText}>{item}</Text>
                    </View>
                  ))}
                </View>

                {/* 탈퇴 이유 */}
                <Text style={s.fieldLabel}>탈퇴 이유 <Text style={s.optional}>(선택)</Text></Text>
                <TextInput
                  style={s.textArea}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="아쉬운 점이 있으면 알려주세요. 서비스 개선에 도움이 돼요."
                  placeholderTextColor={Colors.text.placeholder}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                />

                {/* 확인 입력 */}
                <Text style={s.fieldLabel}>
                  삭제 확인 — <Text style={s.confirmWord}>"{CONFIRM_WORD}"</Text>를 입력해주세요
                </Text>
                <TextInput
                  style={s.confirmInput}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder={CONFIRM_WORD}
                  placeholderTextColor={Colors.text.placeholder}
                  autoCorrect={false}
                  autoCapitalize="none"
                />

                {/* 액션 버튼 */}
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setDeleteOpen(false); setConfirm(''); setReason(''); }}>
                    <Text style={s.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.deleteBtn, (!canSubmit || submitting) && s.deleteBtnDisabled]}
                    onPress={onConfirm}
                    disabled={!canSubmit || submitting}
                    activeOpacity={0.88}
                  >
                    <Text style={s.deleteBtnText}>{submitting ? '삭제 중…' : '계정 영구 삭제'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={{ height: Spacing[48] }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function providerLabel(loginType: 'apple' | 'google' | 'email') {
  if (loginType === 'apple')  return 'Apple';
  if (loginType === 'google') return 'Google';
  return '이메일';
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20] },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  // ── 계정 정보 섹션 ──
  section: { gap: Spacing[10] },
  sectionLabel: { ...Typography.label.l, color: Colors.text.secondary, fontWeight: '700' },
  infoCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    borderWidth: 1, borderColor: Colors.border.default,
    padding: Spacing[16],
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[10] },
  infoText: { ...Typography.body.m, color: Colors.text.primary },

  // ── 계정 삭제 (차분한 톤) ──
  dangerLabel: { ...Typography.label.l, color: Colors.text.secondary, fontWeight: '700' },
  dangerDesc:  { ...Typography.body.s, color: Colors.text.tertiary, lineHeight: 20 },
  dangerTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[12],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l, borderWidth: 1, borderColor: Colors.border.default,
    padding: Spacing[16],
  },
  dangerTriggerText: { flex: 1, ...Typography.body.m, color: Colors.status.error.text, fontWeight: '600' },

  // ── 삭제 폼 ──
  deleteForm: { gap: Spacing[16] },
  warnCard: {
    flexDirection: 'row', gap: Spacing[10], alignItems: 'flex-start',
    backgroundColor: Colors.status.error.bg,
    padding: Spacing[14], borderRadius: Radius.card,
  },
  warnText: { flex: 1, ...Typography.body.s, color: Colors.status.error.text, lineHeight: 20 },

  lossList: { gap: Spacing[6], paddingLeft: Spacing[4] },
  lossRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[8] },
  lossDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.text.tertiary },
  lossText: { ...Typography.body.s, color: Colors.text.secondary },

  fieldLabel: { ...Typography.label.m, color: Colors.text.primary, fontWeight: '600' },
  optional:   { ...Typography.label.m, color: Colors.text.tertiary, fontWeight: '400' },

  textArea: {
    minHeight: 80, padding: Spacing[12],
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
    ...Typography.body.m, color: Colors.text.primary,
  },
  confirmWord:  { color: Colors.status.error.text, fontWeight: '700' },
  confirmInput: {
    height: 48, paddingHorizontal: Spacing[14],
    borderRadius: Radius.card, borderWidth: 1.5, borderColor: Colors.status.error.text,
    backgroundColor: Colors.surface.default,
    ...Typography.body.l, color: Colors.text.primary,
  },

  actionRow: { flexDirection: 'row', gap: Spacing[10] },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: Radius.round,
    borderWidth: 1.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { ...Typography.label.m, color: Colors.text.secondary, fontWeight: '600' },
  deleteBtn: {
    flex: 2, height: 48, borderRadius: Radius.round,
    backgroundColor: Colors.status.error.text,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnDisabled: { backgroundColor: Colors.border.strong },
  deleteBtnText: { ...Typography.label.m, color: '#FFFFFF', fontWeight: '700' },
});
