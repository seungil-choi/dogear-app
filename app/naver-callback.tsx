/**
 * dogear://naver-callback — 네이버 로그인이 끝나고 브라우저가 앱으로 돌아오는 주소.
 *
 * - 로그인 화면이 결과를 기다리는 중이면(대부분) 그쪽이 마무리한다 → 여기서는 이전 화면으로 돌아간다.
 * - 로그인 중에 앱이 종료됐다가 이 링크로 다시 열린 경우(안드로이드)엔 기다리는 화면이 없다 →
 *   저장해 둔 verifier로 여기서 마무리하고 스플래시로 보낸다(스플래시가 동의·강아지 등록을 판단).
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../src/constants/tokens';
import { completeNaverCallback, isNaverLoginWaiting } from '../src/lib/naverLogin';
import { reportError } from '../src/utils/errorReporter';
import { notify } from '../src/utils/dialog';
import { AUTH } from '../src/constants/messages';
import { useAppStore } from '../src/store/useAppStore';

WebBrowser.maybeCompleteAuthSession();

export default function NaverCallback() {
  const router = useRouter();
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (Platform.OS !== 'android' || isNaverLoginWaiting()) {
      if (router.canGoBack()) router.back();
      else router.replace('/(auth)/splash');
      return;
    }
    if (!url) return;   // 링크를 아직 못 읽었다
    let cancelled = false;
    (async () => {
      const res = await completeNaverCallback(url);
      if (cancelled) return;
      if (!res.ok && res.reason === 'failed' && res.detail !== 'no_pending') {
        reportError(new Error(`login naver failed (cold): ${res.detail}`), 'handled');
        notify(AUTH.socialFailed('네이버'));
      }
      if (res.ok) {
        // 프로필은 SIGNED_IN 다음 틱에 불러온다 — 채워지기 전에 스플래시로 가면 로그인 화면으로 보낸다
        for (let i = 0; i < 40 && !useAppStore.getState().user; i++) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      if (cancelled) return;
      router.replace('/(auth)/splash');
    })();
    return () => { cancelled = true; };
  }, [url, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg.primary }}>
      <ActivityIndicator color={Colors.brand.primary} />
    </View>
  );
}
