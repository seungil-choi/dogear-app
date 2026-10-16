/**
 * 유형 테스트 — 앱 안 웹뷰 (planning/34 1장)
 *
 * 웹 테스트(dogear.pet/type/…)를 ?app=1로 연다. 웹은 앱 안이면 결과·이미지·링크 공유를 메시지로 넘긴다:
 *   result     → 고른 강아지 프로필에 저장(save_dog_type_result)
 *   image      → 갤러리 저장 또는 공유 시트 (안드로이드 웹뷰는 웹 공유·blob 다운로드를 못 한다)
 *   share-link → 앱 공유 시트
 *
 * 갤러리 저장: 안드로이드 13+는 권한 없이 저장된다. 그 아래 버전은 저장 권한을 앱에서 막아 두었으므로
 * (사진 권한 정책) 공유 시트로 넘기고 「갤러리에 저장」을 고르게 안내한다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, BackHandler, Linking, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { File as FsFile, Paths } from 'expo-file-system';
import { Icon } from '../src/components/common/Icon';
import { EmptyState } from '../src/components/common/EmptyState';
import { Colors, Typography, Spacing, Layout, Radius } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { toast } from '../src/utils/toast';
import { actionSheet } from '../src/utils/dialog';
import { IS_REAL_AUTH } from '../src/config/env';
import { loadTypeTests, saveTypeResult, inAppUrl, resultName, type TypeTest, type TypeTestMessage } from '../src/lib/typeTests';

/** 웹뷰 안에서 이동을 허용하는 곳 — 그 밖의 링크는 외부 브라우저로 */
const ALLOWED_HOSTS = new Set(['dogear.pet', 'www.dogear.pet', 'dogear-type.vercel.app']);

function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

async function writeImage(dataUrl: string, fileName?: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const safe = (fileName ?? 'dogear-result.png').replace(/[^A-Za-z0-9._-]/g, '_');
  const file = new FsFile(Paths.cache, `${Date.now()}-${safe}`);
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

async function shareFile(uri: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '결과 이미지 공유' });
}

export default function TypeTestScreen() {
  const router = useRouter();
  const { test: testKey, dogId } = useLocalSearchParams<{ test: string; dogId?: string }>();
  const dogs = useAppStore(s => s.dogs);
  const activeDog = useAppStore(s => s.activeDog);

  const [test, setTest] = useState<TypeTest | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [webError, setWebError] = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const [webKey, setWebKey] = useState(0);
  const [selectedDogId, setSelectedDogId] = useState<string | undefined>(dogId ?? activeDog?.dog_id);
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const savedRef = useRef<string | null>(null);

  const dog = useMemo(() => dogs.find(d => d.dog_id === selectedDogId) ?? dogs[0], [dogs, selectedDogId]);

  // 강아지가 없으면 등록부터
  useEffect(() => {
    if (dogs.length === 0) {
      toast.info('테스트 결과를 남길 강아지를 먼저 등록해 주세요');
      router.replace('/(auth)/dog-setup' as any);
    }
  }, [dogs.length, router]);

  useEffect(() => {
    loadTypeTests()
      .then(list => {
        const t = list.find(x => x.key === testKey && x.status === 'live');
        if (t) setTest(t); else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, [testKey]);

  // 안드로이드 뒤로가기 = 웹 안에서 먼저 뒤로
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && webRef.current) { webRef.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  const chooseDog = useCallback(async () => {
    if (dogs.length < 2) return;
    const idx = await actionSheet('어느 강아지의 결과로 남길까요?', dogs.map(d => ({ label: d.name })));
    if (idx >= 0 && dogs[idx]) {
      setSelectedDogId(dogs[idx].dog_id);
      savedRef.current = null;   // 강아지를 바꾸면 같은 결과도 새 강아지에 다시 저장할 수 있게
    }
  }, [dogs]);

  const handleImage = useCallback(async (msg: Extract<TypeTestMessage, { type: 'image' }>) => {
    let uri: string;
    try {
      uri = await writeImage(msg.dataUrl, msg.fileName);
    } catch (e: any) {
      console.error('[type-test] 이미지 파일 쓰기 실패:', e?.message ?? e);
      toast.error('이미지를 만들지 못했어요. 화면을 캡처해 주세요');
      return;
    }
    if (msg.action === 'share') {
      await shareFile(uri).catch(() => toast.error('공유하지 못했어요'));
      return;
    }
    try {
      if (Platform.OS === 'ios') {
        const perm = await MediaLibrary.requestPermissionsAsync(true);
        if (!perm.granted) { toast.error('사진 추가 권한이 없어 저장하지 못했어요'); return; }
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      toast.success('갤러리에 저장했어요');
    } catch (e: any) {
      // 안드로이드 12 이하: 저장 권한을 앱에서 막아 두었다 → 공유 시트로 넘긴다
      console.warn('[type-test] 갤러리 직접 저장 실패 → 공유로 대신:', e?.message ?? e);
      toast.info('공유 메뉴에서 「갤러리에 저장」을 골라 주세요');
      await shareFile(uri).catch(() => toast.error('이미지를 저장하지 못했어요. 화면을 캡처해 주세요'));
    }
  }, []);

  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    let msg: TypeTestMessage;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'result') {
      if (!dog || msg.test !== testKey) return;
      const key = `${dog.dog_id}:${msg.test}:${msg.result}`;
      if (savedRef.current === key) return;   // 결과 화면을 다시 그려도 한 번만 저장
      savedRef.current = key;
      if (!IS_REAL_AUTH) { toast.success(`${dog.name}의 결과를 프로필에 남겼어요`); return; }
      try {
        await saveTypeResult(dog.dog_id, msg);
        toast.success(`${dog.name}의 결과 「${resultName(test ?? undefined, msg.result)}」를 프로필에 남겼어요`);
      } catch (err: any) {
        savedRef.current = null;
        console.error('[type-test] 결과 저장 실패:', err?.message ?? err);
        toast.error('결과를 저장하지 못했어요. 다시 해 주세요');
      }
      return;
    }
    if (msg.type === 'image' && typeof msg.dataUrl === 'string' && msg.dataUrl.startsWith('data:image/')) {
      handleImage(msg);
      return;
    }
    if (msg.type === 'share-link' && typeof msg.url === 'string' && ALLOWED_HOSTS.has(hostOf(msg.url) ?? '')) {
      Share.share({ message: msg.text ? `${msg.text}\n${msg.url}` : msg.url }).catch(() => {});
    }
  }, [dog, testKey, test, handleImage]);

  const onShouldStart = useCallback((req: WebViewNavigation) => {
    const host = hostOf(req.url);
    if (!host) return req.url.startsWith('about:') || req.url.startsWith('data:') || req.url.startsWith('blob:');
    if (ALLOWED_HOSTS.has(host)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  const url = test ? inAppUrl(test) : null;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="닫기">
          <Icon name="close" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{test?.title ?? '유형 테스트'}</Text>
        {dog ? (
          <TouchableOpacity
            style={s.dogChip}
            onPress={chooseDog}
            disabled={dogs.length < 2}
            accessibilityRole="button"
            accessibilityLabel={`${dog.name}의 결과로 저장${dogs.length > 1 ? ', 눌러서 강아지 바꾸기' : ''}`}
          >
            <Text style={s.dogChipText} numberOfLines={1}>{dog.name}</Text>
            {dogs.length > 1 && <Icon name="down" size={14} color={Colors.brand.primary} />}
          </TouchableOpacity>
        ) : <View style={s.headerBtn} />}
      </View>

      {loadError ? (
        <View style={s.center}>
          <EmptyState headline="테스트를 열 수 없어요" description="잠시 뒤 다시 시도해 주세요." ctaLabel="돌아가기" onCta={() => router.back()} />
        </View>
      ) : webError ? (
        <View style={s.center}>
          <EmptyState
            headline="테스트를 불러오지 못했어요"
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
            ctaLabel="다시 시도"
            onCta={() => { setWebError(false); setWebLoading(true); setWebKey(k => k + 1); }}
          />
        </View>
      ) : url ? (
        <View style={{ flex: 1 }}>
          <WebView
            key={webKey}
            ref={webRef}
            source={{ uri: url }}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStart}
            onNavigationStateChange={nav => { canGoBack.current = nav.canGoBack; }}
            onLoadEnd={() => setWebLoading(false)}
            onError={() => setWebError(true)}
            onHttpError={ev => { if (ev.nativeEvent.statusCode >= 500) setWebError(true); }}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
            style={s.web}
          />
          {webLoading && (
            <View style={s.loading} pointerEvents="none">
              <ActivityIndicator color={Colors.brand.primary} />
            </View>
          )}
        </View>
      ) : (
        <View style={s.center}><ActivityIndicator color={Colors.brand.primary} /></View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[12],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
    gap: Spacing[8],
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, ...Typography.title.m, color: Colors.text.primary },
  dogChip: {
    maxWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.subtle,
  },
  dogChipText: { ...Typography.label.m, color: Colors.brand.primary, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  web: { flex: 1, backgroundColor: Colors.bg.primary },
  loading: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg.primary },
});
