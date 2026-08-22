import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="splash" options={{ animation: 'none' }} />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="dog-setup" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      {/* 계정 제재 안내 — 뒤로가기로 빠져나가지 못하게 애니메이션 없이 고정 */}
      <Stack.Screen name="account-restricted" options={{ animation: 'none', gestureEnabled: false }} />
    </Stack>
  );
}
