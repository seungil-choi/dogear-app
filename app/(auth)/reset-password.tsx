/**
 * 비밀번호 재설정 — 메일 링크(dogear://reset-password#access_token=…&type=recovery)로 열린다.
 *
 * 예전엔 앱에서 재설정 메일을 보내도 링크가 갈 곳이 없었다: 네이티브엔 window.location이 없어
 * redirectTo가 비었고(→ Supabase 사이트 URL), 앱에 재설정 화면 자체가 없었다(2026-10-16 감사).
 *
 * 흐름: 링크의 토큰으로 세션을 만든다 → 새 비밀번호 입력 → updateUser → 홈으로.
 * ⚠️ Supabase Auth의 Redirect URLs에 dogear://reset-password가 등록돼 있어야 링크가 여기로 온다.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Icon } from '../../src/components/common/Icon';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Colors, Typography, Spacing, Radius, Layout } from '../../src/constants/tokens';
import { supabase } from '../../src/lib/supabase';
import { toast } from '../../src/utils/toast';
import { reportError } from '../../src/utils/errorReporter';
import { validatePassword } from '../../src/utils/password';

type Phase = 'verifying' | 'ready' | 'invalid' | 'saving';

/** URL의 #fragment와 ?query 양쪽에서 값을 읽는다(공급자·흐름에 따라 위치가 다르다) */
function readParams(url: string | null): Record<string, string> {
  if (!url) return {};
  const out: Record<string, string> = {};
  const take = (part: string) => part.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  });
  const q = url.indexOf('?'); const h = url.indexOf('#');
  if (q >= 0) take(url.slice(q + 1, h > q ? h : undefined));
  if (h >= 0) take(url.slice(h + 1));
  return out;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (url === null) return;   // 아직 URL을 읽는 중
    (async () => {
      const p = readParams(url);
      try {
        if (p.error || p.error_description) throw new Error(p.error_description || p.error);
        if (p.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(p.code);
          if (error) throw error;
        } else if (p.access_token && p.refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
          if (error) throw error;
        } else {
          // 링크 없이 들어왔지만 이미 복구 세션이 있으면 그대로 진행
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error('no recovery token');
        }
        setPhase('ready');
      } catch (e: any) {
        reportError(new Error(`reset-password link failed: ${e?.message ?? e}`), 'handled');
        setPhase('invalid');
      }
    })();
  }, [url]);

  const check = validatePassword(pw);
  const matchOk = pw.length > 0 && pw === confirm;
  const canSave = phase === 'ready' && check.ok && matchOk;

  const save = async () => {
    if (!canSave) return;
    setPhase('saving');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      reportError(new Error(`reset-password update failed: ${error.message}`), 'handled');
      toast.error(/same|different/i.test(error.message) ? '이전과 다른 비밀번호를 입력해 주세요' : '비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요');
      setPhase('ready');
      return;
    }
    toast.success('비밀번호를 바꿨어요');
    router.replace('/(auth)/splash');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(auth)/login')} hitSlop={8} accessibilityLabel="닫기">
          <Icon name="close" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>비밀번호 재설정</Text>
        <View style={{ width: 40 }} />
      </View>

      {phase === 'verifying' ? (
        <View style={s.center}><ActivityIndicator color={Colors.brand.primary} /></View>
      ) : phase === 'invalid' ? (
        <View style={s.center}>
          <EmptyState
            headline="링크가 만료됐거나 올바르지 않아요"
            description="재설정 메일을 다시 받아 가장 최근 링크로 열어 주세요."
            ctaLabel="재설정 메일 다시 받기"
            onCta={() => router.replace('/(auth)/forgot-password')}
          />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.content}>
            <Text style={s.lead}>새 비밀번호를 입력해 주세요</Text>
            <Text style={s.label}>새 비밀번호</Text>
            <TextInput
              style={s.input}
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="8자 이상, 영문 + 숫자 포함"
              placeholderTextColor={Colors.text.tertiary}
              textContentType="newPassword"
            />
            {pw.length > 0 && !check.ok && <Text style={s.error}>{check.reason}</Text>}
            <Text style={[s.label, { marginTop: Spacing[16] }]}>새 비밀번호 확인</Text>
            <TextInput
              style={s.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="한 번 더 입력"
              placeholderTextColor={Colors.text.tertiary}
              textContentType="newPassword"
            />
            {confirm.length > 0 && !matchOk && <Text style={s.error}>비밀번호가 서로 달라요</Text>}
          </View>
          <View style={s.footer}>
            <TouchableOpacity style={[s.cta, !canSave && s.ctaDisabled]} onPress={save} disabled={!canSave} activeOpacity={0.88}>
              <Text style={s.ctaLabel}>{phase === 'saving' ? '바꾸는 중…' : '비밀번호 바꾸기'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[16],
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.title.m, color: Colors.text.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: Layout.screenPadding, paddingTop: Spacing[24] },
  lead: { ...Typography.body.l, color: Colors.text.primary, marginBottom: Spacing[24] },
  label: { ...Typography.label.m, color: Colors.text.secondary, marginBottom: Spacing[6] },
  input: {
    height: 48, borderRadius: Radius.m, borderWidth: 1, borderColor: Colors.border.default,
    paddingHorizontal: Spacing[14], ...Typography.body.m, color: Colors.text.primary, backgroundColor: Colors.surface.default,
  },
  error: { ...Typography.caption, color: Colors.status.error.text, marginTop: Spacing[6] },
  footer: { paddingHorizontal: Layout.screenPadding, paddingBottom: Spacing[16] },
  cta: { height: 52, borderRadius: Radius.round, backgroundColor: Colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaLabel: { ...Typography.label.l, color: Colors.text.inverse, fontWeight: '700' },
});
