/**
 * 비밀번호 찾기 화면
 *
 * 흐름:
 *  1) 이메일 입력
 *  2) Supabase resetPasswordForEmail → 재설정 메일 발송
 *  3) 메일의 링크 클릭 → 재설정 페이지(미구현, 추후 deep link)
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../../src/constants/tokens';
import { Icon } from '../../src/components/common/Icon';
import { supabase } from '../../src/lib/supabase';
import { notify } from '../../src/utils/dialog';

import { IS_REAL_AUTH } from '../../src/config/env';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSend = async () => {
    if (!emailValid || busy) return;
    setBusy(true);
    try {
      if (!IS_REAL_AUTH) {
        // DEV_SEED 모드: 즉시 통과
        setSent(true);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
      });
      if (error) {
        notify(error.message ?? '재설정 메일 발송에 실패했어요.', '발송 실패');
        return;
      }
      setSent(true);
    } catch {
      notify('재설정 메일 발송 중 문제가 발생했어요.', '오류');
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
        <Text style={s.headerTitle}>비밀번호 찾기</Text>
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
          {sent ? (
            <View style={s.successWrap}>
              <View style={s.successIcon}>
                <Icon name="check" size={32} color={Colors.brand.primary} />
              </View>
              <Text style={s.successTitle}>재설정 메일을 보냈어요</Text>
              <Text style={s.successDesc}>
                {email.trim()}으로{'\n'}
                비밀번호 재설정 링크를 보냈어요.{'\n'}
                메일을 확인해주세요.
              </Text>
              <Text style={s.successNote}>
                메일이 도착하지 않았다면 스팸함을 확인하시거나{'\n'}
                몇 분 후 다시 시도해주세요.
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.lead}>가입 시 사용한 이메일을 입력하면{'\n'}비밀번호 재설정 링크를 보내드려요</Text>

              <View style={s.field}>
                <Text style={s.label}>이메일</Text>
                <View style={s.inputRow}>
                  <Icon name="mail" size={16} color={Colors.text.tertiary} />
                  <TextInput
                    style={s.input}
                    placeholder="가입한 이메일 주소"
                    placeholderTextColor={Colors.text.tertiary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {!sent && (
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.cta, !emailValid && s.ctaDisabled]}
              onPress={handleSend}
              disabled={!emailValid || busy}
              activeOpacity={0.88}
            >
              <Text style={s.ctaLabel}>{busy ? '발송 중…' : '재설정 메일 받기'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {sent && (
          <View style={s.footer}>
            <TouchableOpacity
              style={s.cta}
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.88}
            >
              <Text style={s.ctaLabel}>로그인으로 돌아가기</Text>
            </TouchableOpacity>
          </View>
        )}
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

  // 발송 완료
  successWrap: { alignItems: 'center', paddingTop: Spacing[40], gap: Spacing[12] },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.brand.subtle,
    borderWidth: 2, borderColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[8],
  },
  successTitle: { ...Typography.title.l, color: Colors.text.primary, fontWeight: '800' },
  successDesc: { ...Typography.body.m, color: Colors.text.secondary, textAlign: 'center', lineHeight: 24 },
  successNote: { ...Typography.caption, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 18, marginTop: Spacing[16] },

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
