/**
 * 계정 삭제 화면 (App Store 5.1.1(v) / Google Play 2024.5 필수)
 *
 * 단계: 안내 → 확인 문구 입력("삭제") → deleteAccount() → 로그인 화면 복귀
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';

const CONFIRM_WORD = '삭제';

const LOSS_ITEMS = [
  '모든 발도장 기록과 사진',
  '단골 장소 및 방문 횟수 기록',
  '강아지 프로필과 성향 태그',
  '저장해둔 장소 목록',
  '자주 마주친 강아지 데이터',
];

export default function AccountDeleteScreen() {
  const router = useRouter();
  const deleteAccount = useAppStore(s => s.deleteAccount);

  const [confirm, setConfirm] = useState('');
  const [reason,  setReason]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = confirm.trim() === CONFIRM_WORD;

  const onConfirm = () => {
    if (!canSubmit) return;
    Alert.alert(
      '정말 삭제할까요?',
      '삭제 후에는 데이터를 복구할 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계정 삭제',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await deleteAccount(reason.trim() || undefined);
              router.replace('/(auth)/login');
            } catch (e) {
              Alert.alert('오류', '계정 삭제 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>계정 삭제</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.warnCard}>
            <Icon name="warning" size={20} color={Colors.status.error.text} />
            <Text style={s.warnText}>
              계정을 삭제하면 아래 정보가 모두 사라지고, 되돌릴 수 없어요.
            </Text>
          </View>

          <View style={s.list}>
            {LOSS_ITEMS.map((item, idx) => (
              <View key={idx} style={s.lossRow}>
                <View style={s.dot} />
                <Text style={s.lossText}>{item}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sectionTitle}>탈퇴 이유 (선택)</Text>
          <TextInput
            style={s.input}
            value={reason}
            onChangeText={setReason}
            placeholder="아쉬운 점이 있으면 알려주세요. 더 나은 서비스를 만드는 데 도움이 돼요."
            placeholderTextColor={Colors.text.placeholder}
            multiline
            maxLength={300}
            textAlignVertical="top"
          />

          <Text style={s.sectionTitle}>삭제 확인</Text>
          <Text style={s.confirmHint}>
            정말 삭제하려면 아래 입력란에 <Text style={s.bold}>"{CONFIRM_WORD}"</Text>를 입력해주세요.
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
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.cta, (!canSubmit || submitting) && s.ctaDisabled]}
            onPress={onConfirm}
            disabled={!canSubmit || submitting}
            activeOpacity={0.88}
          >
            <Text style={s.ctaLabel}>{submitting ? '삭제 중…' : '계정 영구 삭제'}</Text>
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

  warnCard: {
    flexDirection: 'row', gap: Spacing[12], alignItems: 'flex-start',
    backgroundColor: Colors.status.error.bg,
    padding: Spacing[14], borderRadius: Radius.l,
    marginBottom: Spacing[20],
  },
  warnText: { flex: 1, ...Typography.body.m, color: Colors.status.error.text, lineHeight: 22 },

  list: { gap: Spacing[8], marginBottom: Spacing[28] },
  lossRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[10] },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.text.tertiary },
  lossText: { ...Typography.body.m, color: Colors.text.secondary },

  sectionTitle: {
    ...Typography.title.s, color: Colors.text.primary,
    marginTop: Spacing[8], marginBottom: Spacing[8],
  },
  input: {
    minHeight: 90, padding: Spacing[14],
    borderRadius: Radius.l, borderWidth: 1, borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
    ...Typography.body.m, color: Colors.text.primary,
    marginBottom: Spacing[20],
  },

  confirmHint: { ...Typography.body.m, color: Colors.text.secondary, marginBottom: Spacing[10] },
  bold: { fontWeight: '700', color: Colors.status.error.text },
  confirmInput: {
    height: 50, paddingHorizontal: Spacing[14],
    borderRadius: Radius.l, borderWidth: 1.5, borderColor: Colors.status.error.text,
    backgroundColor: Colors.surface.default,
    ...Typography.body.l, color: Colors.text.primary,
  },

  footer: {
    paddingHorizontal: Spacing[20], paddingVertical: Spacing[16],
    borderTopWidth: 1, borderTopColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
  },
  cta: {
    height: 54, borderRadius: Radius.l,
    backgroundColor: Colors.status.error.text,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: Colors.border.strong },
  ctaLabel: { ...Typography.title.m, color: '#FFFFFF' },
});
