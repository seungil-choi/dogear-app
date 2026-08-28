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
import { ActionSheetHost } from '../src/components/common/ActionSheetHost';
import { useLocation } from '../src/hooks/useLocation';
import { useAppEntryPermissions } from '../src/hooks/useAppEntryPermissions';
import { useNearbySpots } from '../src/hooks/useNearbySpots';
import { useUserData } from '../src/hooks/useUserData';
import { usePushToken } from '../src/hooks/usePushToken';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';
import { installErrorReporter } from '../src/utils/errorReporter';

/** 운영자 제재로 앱 본체를 막아야 하는 상태인가 (정책 18번 §7·§8.1) */
function isRestrictedUser(status?: string | null) {
  return status === 'blocked';
}

// 인증 가드: 제재 사용자를 전용 안내 화면으로, 탈퇴 계정은 로그아웃 처리
function AuthGate() {
  const router = useRouter();
  const user = useAppStore(s => s.user);
  const logout = useAppStore(s => s.logout);
  const handledRef = React.useRef<string | null>(null);
  // 루트 네비게이터가 마운트되기 전 router.replace 호출 방지
  // ("Attempted to navigate before mounting the Root Layout" 크래시 차단)
  const navReady = !!useRootNavigationState()?.key;

  // 전역 오류 수집 — 되도록 일찍, 1회만. ErrorBoundary가 못 잡는
  // 이벤트 핸들러·비동기 예외를 여기서 받는다.
  useEffect(() => { installErrorReporter(); }, []);

  useEffect(() => {
    if (!navReady) return;
    if (!user) return;

    // ── 제재 계정: 세션을 끊지 않는다 ──────────────────────────────
    //   예전엔 Alert 한 번 띄우고 곧바로 로그아웃시켰다. 그러면 사유·기간을 알 수 없고
    //   무엇보다 **이의를 제기할 방법이 사라진다**(정책 §8.1이 이 방식을 명시적으로 거부).
    //   세션이 있어야 my_moderation_actions()·submit_appeal()을 부를 수 있으므로,
    //   로그아웃 대신 전용 안내 화면으로 보내고 앱 본체는 Stack.Protected로 막는다.
    if (isRestrictedUser(user.status)) {
      if (handledRef.current === `r:${user.user_id}`) return;
      handledRef.current = `r:${user.user_id}`;
      // 새 라우트는 expo-router 타입이 dev 서버 기동 때 생성된다 — 기존 화면들과 같은 방식
      router.replace('/(auth)/account-restricted' as any);
      return;
    }

    // ── 탈퇴 계정: 되돌릴 것도 이의할 것도 없다 → 정리하고 내보낸다 ──
    if (user.status === 'deleted') {
      if (handledRef.current === `d:${user.user_id}`) return;
      handledRef.current = `d:${user.user_id}`;
      notify('탈퇴한 계정이에요. 다시 이용하시려면 새로 가입해주세요.', '계정 안내');
      // 서버 세션까지 종료 (store만 비우면 잔존 세션이 복원돼 그대로 다시 로그인됨)
      supabase.auth.signOut().catch(() => {});
      // 소셜 SDK 세션도 끊는다 — 남겨두면 로그인 버튼을 누르는 즉시 같은 계정으로
      // 재인증되어 같은 안내가 반복되고, 다른 계정으로 갈아탈 수도 없다.
      severSocialSessions().catch(() => {});
      logout();
      router.replace('/(auth)/login');
    }
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
  const userStatus = useAppStore(s => s.user?.status);
  // 제재 사용자는 로그인 상태지만 앱 본체에 들어갈 수 없다.
  // 뒤로가기로 되돌아오는 경로까지 막으려면 리다이렉트가 아니라 가드여야 한다.
  const canUseApp = isAuthenticated && !isRestrictedUser(userStatus);
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
        <Stack.Protected guard={canUseApp}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="spot/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        {/* 장소 사진 전체 보기 — 상세는 12장만, 나머지는 여기서 이어 받는다 */}
        <Stack.Screen
          name="spot/[id]/photos"
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
          name="self-check"
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
        {/* 강아지 상세 — 선언이 없으면 루트 Stack에 자동 등록되어 **보호구역 밖**에 놓인다.
            (홈·마이에서만 들어가지만 딥링크로는 바로 열린다) */}
        <Stack.Screen
          name="dog-detail"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        {/* 내 갤러리 — 내가 올린 사진을 모아 보고 관리한다(마이페이지에서 진입) */}
        <Stack.Screen
          name="my-gallery"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        {/* 조치 내역·이의제기 (§8.3) — 알림함의 조치 통지에서 진입 */}
        <Stack.Screen
          name="moderation-notices"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        </Stack.Protected>
      </Stack>
      {/* 전역 토스트 — Stack 위에 떠야 하므로 형제 중 마지막에 둔다 */}
      <ToastHost />
      {/* 전역 액션 시트 — OS Alert의 안드로이드 3버튼 제한을 피하기 위한 자체 레이어 */}
      <ActionSheetHost />
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
