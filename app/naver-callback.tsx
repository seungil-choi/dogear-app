/**
 * dogear://naver-callback — 네이버 로그인이 끝나고 브라우저가 앱으로 돌아오는 주소.
 *
 * 실제 처리는 login.tsx의 signInWithNaver()가 한다(인증 세션이 이 URL을 받아 돌려준다).
 * 다만 안드로이드에서는 같은 링크가 라우터로도 들어와 이 화면이 한 번 열린다 —
 * 화면이 없으면 '찾을 수 없음'이 뜨므로, 아무것도 하지 않고 이전 화면으로 돌아간다.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../src/constants/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function NaverCallback() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/splash');
  }, [router]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg.primary }}>
      <ActivityIndicator color={Colors.brand.primary} />
    </View>
  );
}
