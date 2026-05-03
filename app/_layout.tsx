import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { useAuth } from '../src/hooks/useAuth';
import { useLocation } from '../src/hooks/useLocation';
import { useNearbySpots } from '../src/hooks/useNearbySpots';
import { useUserData } from '../src/hooks/useUserData';

// 인증 가드: 로그아웃 상태에서 보호 화면 접근 시 로그인으로 리다이렉트
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAppStore(s => s.isAuthenticated);

  useEffect(() => {
    const seg0 = segments[0] as string | undefined;
    // (auth) 그룹과 (legal) 그룹은 비로그인 상태에서도 접근 허용
    const isPublic = seg0 === '(auth)' || seg0 === '(legal)';
    if (!isAuthenticated && !isPublic) {
      router.replace('/(auth)/splash' as any);
    }
  }, [isAuthenticated, segments, router]);

  return null;
}

// DEV_PREVIEW_SEED=false일 때만 실 Supabase 인증 + 데이터 로드 활성화
const IS_REAL_AUTH = process.env.EXPO_PUBLIC_DEV_SEED !== 'true';

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
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  return (
    <GestureHandlerRootView style={s.root as any}>
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
    </GestureHandlerRootView>
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
