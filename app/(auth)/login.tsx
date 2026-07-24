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
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Platform, ScrollView, KeyboardAvoidingView, Image,
} from 'react-native';
// react-native의 SafeAreaView는 Android에서 무동작 → safe-area-context 사용 (하단 겹침 방지)
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../../src/utils/dialog';
import { toast } from '../../src/utils/toast';
import { track, EVENT } from '../../src/utils/analytics';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Icon } from '../../src/components/common/Icon';
import {
  AppleLogo, GoogleLogo, KakaoLogo, NaverLogo,
} from '../../src/components/common/SnsLogos';
import { supabase } from '../../src/lib/supabase';

import { IS_REAL_AUTH } from '../../src/config/env';
import { TextField } from '../../src/components/common/TextField';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Google Sign-In 초기 설정
if (IS_REAL_AUTH && Platform.OS !== 'web') {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
  // 카카오 네이티브 SDK 초기화 (New Architecture 정식 지원 라이브러리)
  initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '');
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [busy, setBusy] = useState(false);

  // 인증 완료 후 라우팅
  //  - 동의 이력이 없으면(신규) → consent → dog-setup → tabs 온보딩
  //  - 있으면(재로그인) → 홈으로. 강아지는 useAuth가 비동기로 복원하며,
  //    없더라도 홈에서 등록을 유도하므로 dog-setup으로 강제 튕기지 않는다.
  //  ⚠️ 렌더 시점의 stale 값이 아니라 최신 store 상태로 판단.
  const proceedAfterAuth = async (provider: string = 'guest') => {
    login();
    track(EVENT.login_completed, { screen_name: 'login', provider });

    // 신규/기존 판별은 '서버의 동의 이력'을 기준으로 한다.
    //  · 로컬(zustand)로 판단하면 재설치 시 이력이 날아가 매번 온보딩으로 튕겼다.
    //  · 반대로 무조건 홈으로 보내면 소셜 신규 가입자가 법정 필수 동의를 건너뛴다.
    //  · 게스트/DEV 모드는 Supabase 세션이 없으므로 자연히 홈으로 빠진다.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(tabs)'); return; }

      const meta: any = user.user_metadata ?? {};
      const name =
        meta.nickname || meta.name || meta.full_name ||
        (user.email ? user.email.split('@')[0] : '') || '반려인';

      const { data: consent } = await supabase
        .from('consents')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!consent) {
        toast(`반갑습니다, ${name}님`);
        router.replace('/(auth)/consent');
        return;
      }
      toast(`다시 오셨네요, ${name}님`);
      router.replace('/(tabs)');
    } catch (e) {
      // 조회 실패로 로그인 자체를 막지는 않는다
      console.error('post-auth routing error:', e);
      router.replace('/(tabs)');
    }
  };

  // 이메일 로그인
  const handleEmailLogin = async () => {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setEmailError('올바른 이메일을 입력해주세요.');
      return;
    }
    if (!password) { notify('비밀번호를 입력해주세요.'); return; }

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
      // @react-native-kakao/user: 네이티브 로그인 → idToken(OIDC) 획득
      //  ⚠️ idToken 반환은 카카오 개발자센터에서 OpenID Connect 활성화가 전제.
      //     구글/애플과 동일한 signInWithIdToken 경로로 통일 (엣지펑션 브리지 제거).
      const { login } = await import('@react-native-kakao/user');
      const result = await login();
      const idToken = (result as any).idToken;
      if (!idToken) { notify('인증 정보를 확인할 수 없어요. 다시 시도해주세요.'); return; }
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'kakao', token: idToken });
      if (error) { notify(error.message); return; }
      proceedAfterAuth();
    } catch (e: any) {
      if (e?.code === 'E_CANCELLED_OPERATION' || /cancel/i.test(e?.message ?? '')) return;
      console.error('Kakao login error:', e);
      notify('카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
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
      // 4.x API: initialize()로 설정 후 login()은 무인자 호출
      NaverLogin.default.initialize({
        appName: 'Dogear',
        consumerKey: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '',
        consumerSecret: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '',
        serviceUrlSchemeIOS: 'dogear',
      });
      const result = await NaverLogin.default.login();
      if (!result?.isSuccess || !result?.successResponse?.accessToken) {
        if (result?.failureResponse?.isCancel) return; // 사용자 취소
        notify('네이버 인증 정보를 확인할 수 없어요.');
        return;
      }
      // Edge Function으로 네이버 토큰 → Supabase 세션 변환
      const { data, error: fnError } = await supabase.functions.invoke('naver-auth', {
        body: { naverAccessToken: result.successResponse.accessToken },
      });
      if (fnError || !data?.email) {
        notify('네이버 로그인 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
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
      notify('네이버 로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
  };

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
          {/* ── 브랜드 (공식 로고: 마크 + 워드마크) ── */}
          <View style={s.brandArea}>
            <View style={s.logoRow}>
              <Image
                source={require('../../assets/logo-mark.png')}
                style={s.logoMark}
                resizeMode="contain"
                accessibilityLabel="DogEar 로고"
              />
              <Image
                source={require('../../assets/logo-wordmark.png')}
                style={s.logoWordmark}
                resizeMode="contain"
                accessibilityLabel="DogEar"
              />
            </View>
            <Text style={s.slogan}>
              우리 아이의 산책 기록을{'\n'}
              <Text style={s.sloganHighlight}>지도로 남겨요</Text>
            </Text>
          </View>

          {/* ── 간편 로그인 (SNS 우선) ── */}
          <Text style={s.snsHeading}>간편하게 시작하기</Text>
          <View style={s.snsRow}>
            <SnsBubble
              onPress={handleKakaoLogin}
              bgColor="#FEE500"
              logo={<KakaoLogo size={22} />}
              ariaLabel="카카오로 시작하기"
            />
            {/* 구글: 웹 클라이언트 ID가 설정된 경우에만 노출 — 미설정 시 100% 실패(DEVELOPER_ERROR)라
                버튼을 숨겨 데드엔드 방지. ID를 eas.json/.env에 넣으면 자동으로 다시 나타남. */}
            {!!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID && (
              <SnsBubble
                onPress={handleGoogleLogin}
                bgColor="#FFFFFF"
                logo={<GoogleLogo size={22} />}
                ariaLabel="구글로 시작하기"
              />
            )}
            <SnsBubble
              onPress={handleNaverLogin}
              bgColor="#03C75A"
              logo={<NaverLogo size={22} />}
              ariaLabel="네이버로 시작하기"
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

          {/* ── 또는 이메일 ── */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>또는 이메일로</Text>
            <View style={s.dividerLine} />
          </View>

          {/* ── 이메일 / 비밀번호 ── */}
          <View style={s.formArea}>
            <TextField
              label="이메일"
              placeholder="name@example.com"
              value={email}
              onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(''); }}
              error={emailError}
              valid={EMAIL_RE.test(email.trim())}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
            />
            <TextField
              label="비밀번호"
              placeholder="비밀번호 입력"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
              textContentType="password"
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleEmailLogin}
            />

            <TouchableOpacity
              style={[s.primaryBtn, busy && s.primaryBtnBusy]}
              onPress={handleEmailLogin}
              activeOpacity={0.88}
              disabled={busy}
            >
              <Text style={s.primaryBtnText}>{busy ? '로그인 중…' : '이메일로 로그인'}</Text>
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

          {/* ── 약관 링크 (간결하게 링크만) ── */}
          <Text style={s.disclaimer}>
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/terms')}>이용약관</Text>
            {' · '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/privacy-policy')}>개인정보 처리방침</Text>
            {' · '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/location-terms')}>위치기반서비스 약관</Text>
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
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[8] },
  logoMark:     { width: 34, height: 35 },   // 마크 비율 403:412
  logoWordmark: { width: 79, height: 26 },   // 워드마크 비율 511:168
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
  snsHeading: {
    ...Typography.label.l,
    fontWeight: '600',
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing[14],
  },
  snsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[16],
    marginBottom: Spacing[4],
  },
  snsBubble: {
    width: 50, height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
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
