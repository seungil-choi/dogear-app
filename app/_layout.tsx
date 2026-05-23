import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform, View } from 'react-native';
import { Colors } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { useAuth } from '../src/hooks/useAuth';
import { notify } from '../src/utils/dialog';
import { useLocation } from '../src/hooks/useLocation';
import { useNearbySpots } from '../src/hooks/useNearbySpots';
import { useUserData } from '../src/hooks/useUserData';
import { usePushToken } from '../src/hooks/usePushToken';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

// 인증 가드: 로그아웃 상태에서 보호 화면 접근 시 로그인으로 리다이렉트
//          + 정지/삭제 사용자 자동 로그아웃 처리
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const user = useAppStore(s => s.user);
  const logout = useAppStore(s => s.logout);
  const notifiedRef = React.useRef<string | null>(null);

  // 운영자가 차단/삭제 처리한 사용자 → 자동 로그아웃 + 안내
  useEffect(() => {
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
    logout();
    router.replace('/(auth)/login');
  }, [user, logout, router]);

  useEffect(() => {
    const seg0 = segments[0] as string | undefined;
    // (auth) 그룹과 (legal) 그룹은 비로그인 상태에서도 접근 허용
    const isPublic = seg0 === '(auth)' || seg0 === '(legal)';
    if (!isAuthenticated && !isPublic) {
      router.replace('/(auth)/splash');
    }
  }, [isAuthenticated, segments, router]);

  return null;
}

// DEV_PREVIEW_SEED=false일 때만 실 Supabase 인증 + 데이터 로드 활성화
import { IS_REAL_AUTH } from '../src/config/env';

// 실 Supabase 인증 세션 복원 (IS_REAL_AUTH=true일 때만 마운트)
function AuthProvider() {
  useAuth();
  return null;
}

// 위치 권한 + 주변 스팟 자동 로드 + 사용자 데이터 로드 (IS_REAL_AUTH=true일 때만 마운트)
function DataProvider() {
  useLocation();       // 위치 권한 요청 + currentLocation 설정
  useNearbySpots();    // 위치 기반 spots 페치 → setSpots
  useUserData();       // 로그인 후 checkins/savedSpots/visitSummaries/familiarSignals 로드
  usePushToken();      // 로그인 후 expo push token 등록
  return null;
}

// 웹에서는 GestureHandlerRootView가 터치를 막으므로 View로 대체
const RootContainer = Platform.OS === 'web' ? View : GestureHandlerRootView;

function RootLayoutInner() {
  const router = useRouter();
  return (
    <ErrorBoundary onResetToHome={() => router.replace('/(tabs)')}>
      <StatusBar style="dark" backgroundColor={Colors.bg.primary} />
      {IS_REAL_AUTH && <AuthProvider />}
      {IS_REAL_AUTH && <DataProvider />}
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
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
          name="(legal)"
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
      </Stack>
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
