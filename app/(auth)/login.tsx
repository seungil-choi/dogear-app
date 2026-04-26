/**
 * 로그인 화면
 *
 * 구조 (레퍼런스 참고):
 *   상단: 앱명 + 슬로건
 *   중앙: 일러스트 영역 (브랜드 캐릭터)
 *   하단: Apple / 카카오 / 네이버 소셜 로그인
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { Icon } from '../../src/components/common/Icon';

// ─── 소셜 로그인 버튼 ──────────────────────────────────────
function SocialButton({
  onPress,
  bgColor,
  textColor,
  borderColor,
  icon,
  label,
}: {
  onPress: () => void;
  bgColor: string;
  textColor: string;
  borderColor?: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <TouchableOpacity
      style={[
        s.socialBtn,
        { backgroundColor: bgColor },
        borderColor ? { borderWidth: 1.5, borderColor } : undefined,
      ]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={s.socialBtnIcon}>{icon}</View>
      <Text style={[s.socialBtnLabel, { color: textColor }]}>{label}</Text>
      {/* 오른쪽 여백 균형 */}
      <View style={{ width: 24 }} />
    </TouchableOpacity>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────
export default function LoginScreen() {
  const router  = useRouter();
  const login   = useAppStore(s => s.login);
  const consent = useAppStore(s => s.consent);

  // 약관 미동의 시 consent → dog-setup, 동의 완료 시 dog-setup으로 직진
  const proceedAfterAuth = () => {
    login();
    if (!consent) {
      router.replace('/(auth)/consent' as any);
    } else {
      router.replace('/(tabs)');
    }
  };

  // Apple 로그인 — 실제 ID 토큰 획득 (프로덕션에서는 Supabase auth.signInWithIdToken으로 연동)
  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('알림', 'Apple 로그인은 iOS에서만 사용할 수 있어요.');
      return;
    }
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // TODO(P0): credential.identityToken을 Supabase에 전달해 세션 생성
      if (credential.identityToken) {
        proceedAfterAuth();
      } else {
        Alert.alert('로그인 실패', '인증 정보를 확인할 수 없어요. 다시 시도해주세요.');
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // 사용자 취소
      Alert.alert('로그인 오류', 'Apple 로그인 중 문제가 발생했어요.');
    }
  };

  // 카카오/네이버 — 추후 SDK 연동 (현재는 임시 처리)
  const handleSocialLogin = (_provider: 'kakao' | 'naver') => {
    Alert.alert('준비 중', '해당 로그인은 곧 지원될 예정이에요.');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>

        {/* ── 상단: 브랜드 ── */}
        <View style={s.brandArea}>
          <View style={s.logoRow}>
            <Icon name="paw-filled" size={28} color={Colors.brand.primary} />
            <Text style={s.appName}>Dogear</Text>
          </View>
          <Text style={s.slogan}>
            우리 아이의 산책 기록을{'\n'}
            <Text style={s.sloganHighlight}>지도로 남겨요</Text>
          </Text>
        </View>

        {/* ── 중앙: 일러스트 ── */}
        <View style={s.illustArea}>
          {/* 배경 원 */}
          <View style={s.bgCircle} />

          {/* 메인 아이콘 */}
          <View style={s.mainIconWrap}>
            <Icon name="dog" size={96} color={Colors.brand.primary} />
          </View>

          {/* 플로팅 배지들 */}
          <View style={[s.badge, s.badgeTopLeft]}>
            <Icon name="leaf-filled" size={16} color={Colors.brand.primary} />
            <Text style={s.badgeText}>산책로</Text>
          </View>
          <View style={[s.badge, s.badgeTopRight]}>
            <Icon name="paw-filled" size={14} color={Colors.brand.primary} />
            <Text style={s.badgeText}>발도장</Text>
          </View>
          <View style={[s.badge, s.badgeBottomLeft]}>
            <Icon name="location-filled" size={14} color={Colors.brand.primary} />
            <Text style={s.badgeText}>단골 스팟</Text>
          </View>
          <View style={[s.badge, s.badgeBottomRight]}>
            <Icon name="heart-filled" size={14} color={Colors.brand.primary} />
            <Text style={s.badgeText}>익숙한 강아지</Text>
          </View>
        </View>

        {/* ── 하단: 로그인 버튼 ── */}
        <View style={s.loginArea}>
          {/* Apple */}
          <SocialButton
            onPress={handleAppleLogin}
            bgColor="#1C1C1E"
            textColor="#FFFFFF"
            label="Apple로 계속하기"
            icon={
              <View style={s.appleIcon}>
                <Text style={s.appleIconText}></Text>
              </View>
            }
          />

          {/* 카카오 */}
          <SocialButton
            onPress={() => handleSocialLogin('kakao')}
            bgColor="#FEE500"
            textColor="#191919"
            label="카카오로 계속하기"
            icon={
              <Text style={{ fontSize: 18, color: '#191919', lineHeight: 22 }}>💬</Text>
            }
          />

          {/* 네이버 */}
          <SocialButton
            onPress={() => handleSocialLogin('naver')}
            bgColor="#03C75A"
            textColor="#FFFFFF"
            label="네이버로 계속하기"
            icon={
              <View style={s.naverIcon}>
                <Text style={s.naverIconText}>N</Text>
              </View>
            }
          />

          <Text style={s.disclaimer}>
            로그인하면{' '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/terms' as any)}>이용약관</Text>
            {' · '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/privacy-policy' as any)}>개인정보 처리방침</Text>
            {' · '}
            <Text style={s.disclaimerLink} onPress={() => router.push('/(legal)/location-terms' as any)}>위치기반서비스 약관</Text>
            에 동의한 것으로 간주돼요.
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}

// ─── 스타일 ──────────────────────────────────────────────
const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'space-between', paddingBottom: Spacing[8] },

  // ── 브랜드 영역 ──
  brandArea: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing[28],
    paddingTop: Spacing[32],
    gap: Spacing[12],
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  slogan: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.text.secondary,
    lineHeight: 32,
  },
  sloganHighlight: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.brand.primary,
  },

  // ── 일러스트 영역 ──
  illustArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: Spacing[16],
    paddingHorizontal: Spacing[16],
  },
  bgCircle: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.brand.subtle,
    opacity: 0.6,
  },
  mainIconWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.brand.primaryLight,
  },

  // 플로팅 배지
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.round,
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[6],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  badgeText: {
    ...Typography.label.s,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  badgeTopLeft:    { top: '15%', left: 16 },
  badgeTopRight:   { top: '10%',  left: '65%' },
  badgeBottomLeft: { bottom: '15%', left: 16 },
  badgeBottomRight:{ bottom: '10%', left: '58%' },

  // ── 로그인 영역 ──
  loginArea: {
    paddingHorizontal: Spacing[24],
    gap: Spacing[12],
    paddingBottom: Spacing[8],
  },

  socialBtn: {
    height: 54,
    borderRadius: Radius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[20],
    position: 'relative',
  },
  socialBtnIcon: {
    position: 'absolute',
    left: Spacing[20],
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // Apple 아이콘
  appleIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleIconText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
  },

  // 네이버 N 아이콘
  naverIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  naverIconText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 20,
  },

  // 약관 텍스트
  disclaimer: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing[4],
  },
  disclaimerLink: {
    color: Colors.text.secondary,
    textDecorationLine: 'underline',
  },
});
