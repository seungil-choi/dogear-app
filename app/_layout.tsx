import React, { useEffect } from 'react';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform, View } from 'react-native';
import { Colors } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/hooks/useAuth';
import { notify } from '../src/utils/dialog';
import { ToastHost } from '../src/components/common/ToastHost';
import { useLocation } from '../src/hooks/useLocation';
import { useAppEntryPermissions } from '../src/hooks/useAppEntryPermissions';
import { useNearbySpots } from '../src/hooks/useNearbySpots';
import { useUserData } from '../src/hooks/useUserData';
import { usePushToken } from '../src/hooks/usePushToken';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

// 인증 가드: 로그아웃 상태에서 보호 화면 접근 시 로그인으로 리다이렉트
//          + 정지/삭제 사용자 자동 로그아웃 처리
function AuthGate() {
  const router = useRouter();
  const user = useAppStore(s => s.user);
  const logout = useAppStore(s => s.logout);
  const notifiedRef = React.useRef<string | null>(null);
  // 루트 네비게이터가 마운트되기 전 router.replace 호출 방지
  // ("Attempted to navigate before mounting the Root Layout" 크래시 차단)
  const navReady = !!useRootNavigationState()?.key;

  // 운영자가 차단/삭제 처리한 사용자 → 자동 로그아웃 + 안내
  useEffect(() => {
    if (!navReady) return;
    if (!user) return;
    const blocked = user.status === 'blocked';
    const deleted = user.status === 'deleted';
    if (!blocked && !deleted) return;
    // 동일 user에 대해 중복 알림 방지
    if (notifiedRef.current === user.user_id) return;
    notifiedRef.current = user.user_id;
    notify(
      blocked
        ? '계정이 정지되어 있어요.\n자세한 내용은 고객센터(support@9factorial.com)로 문의해주세요.'
        : '삭제된 계정이에요.\n다시 가입하려면 새로 회원가입해주세요.',
      '계정 안내',
    );
    // 서버 세션까지 종료 (store만 비우면 잔존 세션이 복원돼 차단 사용자가 다시 로그인됨)
    supabase.auth.signOut().catch(() => {});
    // 소셜 SDK 세션도 끊는다 — 남겨두면 로그인 버튼을 누르는 즉시 같은(차단/삭제된) 계정으로
    // 재인증되어 같은 안내가 반복되고, 다른 계정으로 갈아탈 수도 없다.
    severSocialSessions().catch(() => {});
    logout();
    router.replace('/(auth)/login');
  }, [navReady, user, logout, router]);

  // 비로그인 보호는 Stack.Protected(선언적 가드)가 담당 — 여기서 imperative 리다이렉트를 하면
  // 루트 Stack 마운트 전에 navigate가 발생해 "Attempted to navigate before mounting the
  // Root Layout" 크래시가 남 (expo-router 공식 인증 가이드 권장 패턴으로 이관).
  return null;
}

// DEV_PREVIEW_SEED=false일 때만 실 Supabase 인증 + 데이터 로드 활성화
import { IS_REAL_AUTH } from '../src/config/env';
import { severSocialSessions } from '@/lib/socialSession';

// 실 Supabase 인증 세션 복원 (IS_REAL_AUTH=true일 때만 마운트)
function AuthProvider() {
  useAuth();
  return null;
}

// 위치 권한 + 주변 스팟 자동 로드 + 사용자 데이터 로드 (IS_REAL_AUTH=true일 때만 마운트)
function DataProvider() {
  useAppEntryPermissions(); // 앱 실행 즉시 OS 위치·알림 권한 자동 요청(미결정 시 1회)
  useLocation();       // 위치 권한 상태 확인 + currentLocation 설정
  useNearbySpots();    // 위치 기반 spots 페치 → setSpots
  useUserData();       // 로그인 후 checkins/savedSpots/visitSummaries/familiarSignals 로드
  usePushToken();      // 로그인 후 expo push token 등록
  return null;
}

// 웹에서는 GestureHandlerRootView가 터치를 막으므로 View로 대체
const RootContainer = Platform.OS === 'web' ? View : GestureHandlerRootView;

function RootLayoutInner() {
  const router = useRouter();
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  return (
    <ErrorBoundary onResetToHome={() => router.replace('/(tabs)')}>
      <StatusBar style="dark" backgroundColor={Colors.bg.primary} />
      {IS_REAL_AUTH && <AuthProvider />}
      {IS_REAL_AUTH && <DataProvider />}
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        {/* 공개 구역 — (auth)가 첫 화면(앵커): 콜드 스타트·로그아웃 시 splash부터 시작 */}
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="(legal)"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        {/* 보호 구역 — 비로그인 접근 시 선언적으로 앵커((auth))로 회수.
            expo-router 공식 인증 패턴: useEffect+router.replace 대신 Stack.Protected 사용
            (루트 마운트 전 imperative navigate로 인한 크래시 방지) */}
        <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="spot/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="paw-checkin"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="dog-edit"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="visit-history/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="suggest-spot"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="privacy-settings"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="report"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="info-correction"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="blocked-users"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="account-delete"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="app-permissions"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        </Stack.Protected>
      </Stack>
      {/* 전역 토스트 — Stack 위에 떠야 하므로 형제 중 마지막에 둔다 */}
      <ToastHost />
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <RootContainer style={s.root as any}>
      <RootLayoutInner />
    </RootContainer>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      height: '100dvh' as any,
      minHeight: '100dvh' as any,
      paddingTop: 'env(safe-area-inset-top)' as any,
      paddingBottom: 'env(safe-area-inset-bottom)' as any,
      // 모바일 브라우저 tap delay 제거
      touchAction: 'manipulation' as any,
    } : {}),
  },
});
