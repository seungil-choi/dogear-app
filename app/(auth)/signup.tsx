/**
 * 이메일 회원가입 화면
 *
 * 흐름:
 *  1) 이메일 입력 (형식 검증)
 *  2) 비밀번호 입력 (8자 이상 + 영문 + 숫자)
 *  3) 비밀번호 확인 (일치 검증)
 *  4) 가입 → Supabase signUp → 이메일 인증 메일 발송 안내
 *  5) consent → dog-setup → permissions → tabs
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
// react-native의 SafeAreaView는 Android에서 무동작 → safe-area-context 사용 (하단 겹침 방지)
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../../src/constants/tokens';
import { Icon } from '../../src/components/common/Icon';
import { useAppStore } from '../../src/store/useAppStore';
import { supabase } from '../../src/lib/supabase';
import { notify } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';

import { IS_REAL_AUTH } from '../../src/config/env';

// 비밀번호 정책: 8자+ / 영문 + 숫자
function validatePassword(pw: string): { ok: boolean; reason?: string } {
  if (pw.length < 8) return { ok: false, reason: '비밀번호는 8자 이상이에요.' };
  if (!/[A-Za-z]/.test(pw)) return { ok: false, reason: '비밀번호에 영문을 포함해주세요.' };
  if (!/\d/.test(pw)) return { ok: false, reason: '비밀번호에 숫자를 포함해주세요.' };
  return { ok: true };
}

export default function SignupScreen() {
  const router = useRouter();
  const login   = useAppStore(s => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwValidation = validatePassword(password);
  const matchOk = password.length > 0 && password === confirm;
  const canSubmit = emailValid && pwValidation.ok && matchOk && !busy;

  const handleSignup = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (!IS_REAL_AUTH) {
        // DEV_SEED 모드: 즉시 통과
        login();
        track(EVENT.signup_completed, { screen_name: 'signup', provider: 'email' });
        router.replace('/(auth)/consent');
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // 가입 시 이메일 확인 메일 자동 발송 (Supabase Auth 기본)
          // RN에는 window가 있어도 window.location이 없음 → location 존재까지 확인 (undefined.origin 크래시 방지)
          emailRedirectTo:
            typeof window !== 'undefined' && window.location ? window.location.origin : undefined,
        },
      });
      if (error) {
        notify(error.message ?? '가입에 실패했어요.', '가입 실패');
        return;
      }
      track(EVENT.signup_completed, { screen_name: 'signup', provider: 'email' });
      notify(
        `${email.trim()}으로 인증 메일을 보냈어요. 메일의 링크를 눌러 인증을 완료한 뒤 다시 로그인해주세요.`,
        '인증 메일 발송',
      );
      router.replace('/(auth)/login');
    } catch (e: any) {
      // [임시 진단] 실제 네이티브 에러를 화면에 노출 — 원인 파악 후 원복 예정
      notify(`[진단] ${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`, '가입 오류(디버그)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>이메일로 가입</Text>
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
          <Text style={s.lead}>Dogear에서 사용할{'\n'}이메일과 비밀번호를 입력해주세요</Text>

          {/* 이메일 */}
          <View style={s.field}>
            <Text style={s.label}>이메일</Text>
            <View style={s.inputRow}>
              <Icon name="mail" size={16} color={Colors.text.tertiary} />
              <TextInput
                style={s.input}
                placeholder="example@email.com"
                placeholderTextColor={Colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
              {email.length > 0 && (
                <Icon
                  name={emailValid ? 'check' : 'close'}
                  size={14}
                  color={emailValid ? Colors.brand.primary : Colors.status.error.text}
                />
              )}
            </View>
          </View>

          {/* 비밀번호 */}
          <View style={s.field}>
            <Text style={s.label}>비밀번호</Text>
            <View style={s.inputRow}>
              <Icon name="lock" size={16} color={Colors.text.tertiary} />
              <TextInput
                style={s.input}
                placeholder="8자 이상, 영문 + 숫자 포함"
                placeholderTextColor={Colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!busy}
              />
            </View>
            {password.length > 0 && !pwValidation.ok && (
              <Text style={s.errorText}>{pwValidation.reason}</Text>
            )}
          </View>

          {/* 비밀번호 확인 */}
          <View style={s.field}>
            <Text style={s.label}>비밀번호 확인</Text>
            <View style={s.inputRow}>
              <Icon name="lock" size={16} color={Colors.text.tertiary} />
              <TextInput
                style={s.input}
                placeholder="비밀번호를 한 번 더"
                placeholderTextColor={Colors.text.tertiary}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                editable={!busy}
              />
              {confirm.length > 0 && (
                <Icon
                  name={matchOk ? 'check' : 'close'}
                  size={14}
                  color={matchOk ? Colors.brand.primary : Colors.status.error.text}
                />
              )}
            </View>
            {confirm.length > 0 && !matchOk && (
              <Text style={s.errorText}>비밀번호가 일치하지 않아요.</Text>
            )}
          </View>

          <Text style={s.note}>
            가입 후 입력한 이메일로 인증 메일이 발송돼요.{'\n'}
            메일의 링크를 눌러 인증을 완료해주세요.
          </Text>
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.cta, !canSubmit && s.ctaDisabled]}
            onPress={handleSignup}
            disabled={!canSubmit}
            activeOpacity={0.88}
          >
            <Text style={s.ctaLabel}>{busy ? '가입 중…' : '가입하고 시작하기'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: Spacing[40] },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  lead: { ...Typography.title.l, color: Colors.text.primary, lineHeight: 30, marginBottom: Spacing[24] },

  field: { marginBottom: Spacing[16] },
  label: { ...Typography.label.m, color: Colors.text.secondary, marginBottom: Spacing[6], fontWeight: '600' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[10],
    height: 52,
    paddingHorizontal: Spacing[16],
    borderRadius: Radius.l,
    borderWidth: 1.5,
    borderColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
  },
  input: { flex: 1, ...Typography.body.m, color: Colors.text.primary, paddingVertical: 0 },
  errorText: { ...Typography.caption, color: Colors.status.error.text, marginTop: 4, marginLeft: Spacing[4] },

  note: { ...Typography.caption, color: Colors.text.tertiary, lineHeight: 18, marginTop: Spacing[12] },

  footer: {
    paddingHorizontal: Spacing[20],
    paddingVertical: Spacing[16],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
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
