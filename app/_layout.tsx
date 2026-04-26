import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { Colors } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';

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
      router.replace('/(auth)/login' as any);
    }
  }, [isAuthenticated, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={s.root}>
      <StatusBar style="dark" backgroundColor={Colors.bg.primary} />
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
    // @ts-ignore — RNW: 모바일 브라우저 주소창 변동 대응 + safe-area inset 처리
    height: '100dvh',
    minHeight: '100dvh',
    paddingTop: 'env(safe-area-inset-top)' as any,
    paddingBottom: 'env(safe-area-inset-bottom)' as any,
  },
});
