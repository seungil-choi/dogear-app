/**
 * 로그인 화면
 *
 * 가입/로그인 방식:
 *   - 이메일 + 비밀번호 (Supabase Auth)
 *   - SNS: 카카오 / 네이버 / 애플 / 구글 (각 SDK)
 *
 * 구조:
 *   - 상단 뒤로가기 + 브랜드
 *   - 이메일/비번 입력 + 로그인 버튼
 *   - 회원가입 / 비번 찾기 링크
 *   - 구분선 "또는"
 *   - SNS 4종 (카카오·네이버·애플·구글)
 *   - 게스트 시작
 *   - 약관 안내
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Platform, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { notify } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Icon } from '../../src/components/common/Icon';
import {
  AppleLogo, GoogleLogo, KakaoLogo, NaverLogo,
} from '../../src/components/common/SnsLogos';
import { supabase } from '../../src/lib/supabase';

import { IS_REAL_AUTH } from '../../src/config/env';

// Google Sign-In 초기 설정
if (IS_REAL_AUTH && Platform.OS !== 'web') {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
}

// ─── SNS 버튼 (정확한 로고) ────────────────────────────────
function SnsBubble({
  onPress, bgColor, logo, ariaLabel,
}: {
  onPress: () => void;
  bgColor: string;
  logo: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[s.snsBubble, { backgroundColor: bgColor }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={ariaLabel}
    >
      {logo}
    </TouchableOpacity>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────
export default function LoginScreen() {
  const router  = useRouter();
  const login   = useAppStore(s => s.login);
  const consent = useAppStore(s => s.consent);
  const dog     = useAppStore(s => s.dog);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // 신규 흐름: consent → dog-setup → permissions → tabs
  const proceedAfterAuth = (provider: string = 'guest') => {
    login();
    track(EVENT.login_completed, { screen_name: 'login', provider });
    if (!consent) {
      router.replace('/(auth)/consent');
    } else if (!dog) {
      router.replace('/(auth)/dog-setup');
    } else {
      router.replace('/(tabs)');
    }
  };

  // 이메일 로그인
  const handleEmailLogin = async () => {
    const trimmed = email.trim();
    if (!trimmed) { notify('이메일을 입력해주세요.'); return; }
    if (!password) { notify('비밀번호를 입력해주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      notify('올바른 이메일 형식이 아니에요.');
      return;
    }

    setBusy(true);
    try {
      if (!IS_REAL_AUTH) {
        // DEV_SEED 모드: 즉시 통과
        proceedAfterAuth();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) {
        notify(error.message ?? '로그인에 실패했어요. 입력 정보를 확인해주세요.');
        return;
      }
      proceedAfterAuth();
    } catch {
      notify('로그인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  // Apple 로그인
  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios' || !IS_REAL_AUTH) {
      proceedAfterAuth();
      return;
    }
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        notify('인증 정보를 확인할 수 없어요. 다시 시도해주세요.');
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) { notify(error.message); return; }
      proceedAfterAuth();
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      notify('Apple 로그인 중 문제가 발생했어요.');
    }
  };

  // Google 로그인
  const handleGoogleLogin = async () => {
    if (!IS_REAL_AUTH || Platform.OS === 'web') { proceedAfterAuth(); return; }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = (userInfo as any).idToken ?? (userInfo as any).data?.idToken;
      if (!idToken) { notify('인증 정보를 확인할 수 없어요. 다시 시도해주세요.'); return; }
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (error) { notify(error.message); return; }
      proceedAfterAuth();
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e?.code === statusCodes.IN_PROGRESS) return;
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        notify('Google Play Services가 필요해요.');
        return;
      }
      console.error('Google Sign-In error:', e);
      notify('Google 로그인 중 문제가 발생했어요.');
    }
  };

  // 카카오 로그인
  const handleKakaoLogin = async () => {
    if (!IS_REAL_AUTH || Platform.OS === 'web') { proceedAfterAuth(); return; }
    try {
      const KakaoLogin = (await import('@react-native-seoul/kakao-login')).default;
      const token = await KakaoLogin.login();
      const { data, error: fnError } = await supabase.functions.invoke('kakao-auth', {
        body: { kakaoAccessToken: token.accessToken },
      });
      if (fnError || !data?.email || !data?.hashed_token) {
        notify('카카오 로그인 처리에 실패했어요.');
        return;
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: data.email, token: data.otp, type: 'magiclink',
      });
      if (verifyError) { notify(verifyError.message); return; }
      proceedAfterAuth();
    } catch (e: any) {
      if (e?.code === 'E_CANCELLED_OPERATION') return;
      console.error('Kakao login error:', e);
      notify('카카오 로그인 중 문제가 발생했어요.');
    }
  };

  // 네이버 로그인 — SDK 미설치 시 안내, DEV_SEED 모드에서는 통과
  const handleNaverLogin = async () => {
    if (!IS_REAL_AUTH || Platform.OS === 'web') { proceedAfterAuth(); return; }
    try {
      // 네이버 SDK 동적 import — 설치되지 않았으면 catch로 fallback
      // @ts-ignore — 패키지 미설치 시 ts 오류 회피 (런타임에서만 동적 로드)
      const NaverLogin: any = await import('@react-native-seoul/naver-login').catch(() => null);
      if (!NaverLogin) {
        notify('네이버 로그인은 다음 업데이트에서 지원돼요.', '준비 중');
        return;
      }
      const result = await NaverLogin.default.login({
        appName: 'Dogear',
        consumerKey: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '',
        consumerSecret: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '',
        serviceUrlScheme: 'dogear',
      });
      if (!result?.successResponse?.accessToken) {
        notify('네이버 인증 정보를 확인할 수 없어요.');
        return;
      }
      // Edge Function으로 네이버 토큰 → Supabase 세션 변환
      const { data, error: fnError } = await supabase.functions.invoke('naver-auth', {
        body: { naverAccessToken: result.successResponse.accessToken },
      });
      if (fnError || !data?.email) {
        notify('네이버 로그인 처리에 실패했어요. 운영자에게 문의해주세요.');
        return;
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: data.email, token: data.otp, type: 'magiclink',
      });
      if (verifyError) { notify(verifyError.message); return; }
      proceedAfterAuth();
    } catch (e: any) {
      if (e?.code === 'CANCELLED' || e?.message?.includes('cancelled')) return;
      console.error('Naver login error:', e);
      notify('네이버 로그인 중 문제가 발생했어요.');
    }
  };

  // 게스트로 시작
  const handleGuestLogin = () => proceedAfterAuth();

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 브랜드 ── */}
          <View style={s.brandArea}>
            <View style={s.logoRow}>
              <Icon name="paw-filled" size={26} color={Colors.brand.primary} />
              <Text style={s.appName}>Dogear</Text>
            </View>
            <Text style={s.slogan}>
              우리 아이의 산책 기록을{'\n'}
              <Text style={s.sloganHighlight}>지도로 남겨요</Text>
            </Text>
          </View>

          {/* ── 이메일 / 비밀번호 ── */}
          <View style={s.formArea}>
            <View style={s.inputRow}>
              <Icon name="mail" size={16} color={Colors.text.tertiary} />
              <TextInput
                style={s.input}
                placeholder="이메일"
                placeholderTextColor={Colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
            </View>
            <View style={s.inputRow}>
              <Icon name="lock" size={16} color={Colors.text.tertiary} />
              <TextInput
                style={s.input}
                placeholder="비밀번호"
                placeholderTextColor={Colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!busy}
              />
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, busy && s.primaryBtnBusy]}
              onPress={handleEmailLogin}
              activeOpacity={0.88}
              disabled={busy}
            >
              <Text style={s.primaryBtnText}>{busy ? '로그인 중…' : '로그인하기'}</Text>
            </TouchableOpacity>

            <View style={s.formLinks}>
              <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                <Text style={s.linkText}>비밀번호 찾기</Text>
              </TouchableOpacity>
              <View style={s.linkSep} />
              <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                <Text style={[s.linkText, s.linkStrong]}>이메일로 가입하기</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── SNS 구분선 ── */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>SNS 계정으로 시작하기</Text>
            <View style={s.dividerLine} />
          </View>

          {/* ── SNS 4종 (정확한 로고) ── */}
          <View style={s.snsRow}>
            <SnsBubble
              onPress={handleKakaoLogin}
              bgColor="#FEE500"
              logo={<KakaoLogo size={22} />}
              ariaLabel="카카오로 시작하기"
            />
            <SnsBubble
              onPress={handleNaverLogin}
              bgColor="#03C75A"
              logo={<NaverLogo size={22} />}
              ariaLabel="네이버로 시작하기"
            />
            <SnsBubble
              onPress={handleGoogleLogin}
              bgColor="#FFFFFF"
              logo={<GoogleLogo size={22} />}
              ariaLabel="구글로 시작하기"
            />
            {Platform.OS !== 'android' && (
              <SnsBubble
                onPress={handleAppleLogin}
                bgColor="#000000"
                logo={<AppleLogo size={22} />}
                ariaLabel="애플로 시작하기"
              />
            )}
          </View>

          {/* ── 게스트 ── */}
          <TouchableOpacity style={s.guestBtn} onPress={handleGuestLogin} activeOpacity={0.75}>
            <Text style={s.guestBtnText}>둘러보기</Text>
          </TouchableOpacity>
          <Text style={s.guestNote}>로그인 없이 기능을 미리 살펴볼 수 있어요</Text>

          {/* ── 약관 안내 ── */}
          <Text style={s.disclaimer}>
            로그인 후 다음 단계에서{' '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/terms')}>이용약관</Text>
            {' · '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/privacy-policy')}>개인정보 처리방침</Text>
            {' · '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/location-terms')}>위치기반서비스 약관</Text>
            에 직접 동의하게 돼요.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── 스타일 ──────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: {
    paddingHorizontal: Spacing[24],
    paddingTop: Spacing[32],
    paddingBottom: Spacing[40],
  },

  // 브랜드
  brandArea: { gap: Spacing[12], marginBottom: Spacing[32] },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  appName: { fontSize: 24, fontWeight: '800', color: Colors.text.primary, letterSpacing: -0.5 },
  slogan: { fontSize: 22, fontWeight: '500', color: Colors.text.secondary, lineHeight: 32 },
  sloganHighlight: { fontSize: 26, fontWeight: '800', color: Colors.brand.primary },

  // 폼
  formArea: { gap: Spacing[10], marginBottom: Spacing[24] },
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

  primaryBtn: {
    height: 52,
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[6],
  },
  primaryBtnBusy: { backgroundColor: Colors.brand.primaryLight },
  primaryBtnText: { ...Typography.title.s, color: '#FFFFFF', fontWeight: '700' },

  formLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[12],
    marginTop: Spacing[6],
  },
  linkText: { ...Typography.label.m, color: Colors.text.secondary },
  linkStrong: { color: Colors.brand.primary, fontWeight: '700' },
  linkSep: { width: 1, height: 12, backgroundColor: Colors.border.default },

  // 구분선
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[12],
    marginTop: Spacing[8],
    marginBottom: Spacing[16],
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border.default },
  dividerText: { ...Typography.caption, color: Colors.text.tertiary, fontWeight: '500' },

  // SNS 버블
  snsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[16],
    marginBottom: Spacing[28],
  },
  snsBubble: {
    width: 50, height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },

  // 게스트
  guestBtn: {
    height: 48,
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
  },
  guestBtnText: { ...Typography.label.l, fontWeight: '600', color: Colors.text.secondary },
  guestNote: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: Spacing[4],
    marginBottom: Spacing[20],
  },

  // 약관
  disclaimer: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  disclaimerLink: { color: Colors.text.secondary, textDecorationLine: 'underline' },
});
