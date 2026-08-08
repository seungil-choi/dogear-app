/**
 * 카카오맵 컴포넌트 (네이티브: WebView)
 *
 * 사용법:
 *   const ref = useRef<KakaoMapRef>(null);
 *   <KakaoMap ref={ref} markers={markers} onMarkerClick={...} />
 *   ref.current?.setCenter(lat, lng, 4);
 */

import React, {
  useImperativeHandle, useRef, forwardRef, useCallback, useEffect,
} from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '@/constants/tokens';
import { buildKakaoMapHtml } from './kakaoMapHtml';

import { KAKAO_JS_KEY } from '@/config/env';

export type KakaoPinVariant = 'default' | 'visited' | 'regular';

export interface KakaoMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  variant: KakaoPinVariant;
}

export interface KakaoMapProps {
  initialLatitude?: number;
  initialLongitude?: number;
  initialLevel?: number;
  markers: KakaoMarker[];
  userLocation?: { latitude: number; longitude: number } | null;
  selectedId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** 클러스터 탭 — 묶인 장소 id 목록. 지도는 묶음을 풀지 않고 목록으로 넘긴다. */
  onClusterClick?: (ids: string[]) => void;
  onMapClick?: () => void;
  onRegionChange?: (lat: number, lng: number, level: number) => void;
  onReady?: () => void;
  style?: any;
}

export interface KakaoMapRef {
  setCenter: (lat: number, lng: number, level?: number) => void;
}

/**
 * WebView 메인 프레임 이동 허용 목록.
 *
 * 지도는 처음 주입한 HTML 안에서만 동작하므로 페이지를 벗어날 일이 없다.
 * 그런데 originWhitelist는 '*'다 — 카카오 SDK가 오류/차단 페이지로 리다이렉트하거나
 * 렌더된 콘텐츠가 링크를 물고 나가면 임의 사이트가 앱 안에서 열린다.
 * 하위 리소스(스크립트·타일 이미지·XHR)는 이 콜백을 타지 않으므로 지도 동작에는 영향이 없다.
 */
const ALLOWED_NAV_HOSTS = [
  'dogear-demo.vercel.app',
  'dapi.kakao.com',
  'map.kakao.com',
  'mts.daumcdn.net',
  't1.daumcdn.net',
];

function shouldAllowNavigation(request: { url: string }): boolean {
  const url = request.url ?? '';
  // 최초 HTML 주입(about:blank / data:) 은 통과시켜야 지도가 뜬다
  if (url === '' || url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) {
    return true;
  }
  try {
    const host = new URL(url).hostname;
    return ALLOWED_NAV_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

const KakaoMap = forwardRef<KakaoMapRef, KakaoMapProps>(function KakaoMap(props, ref) {
  const webRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const pendingRef = useRef<any[]>([]);

  const send = useCallback((payload: any) => {
    const json = JSON.stringify(payload);
    if (!isReadyRef.current) {
      pendingRef.current.push(payload);
      return;
    }
    webRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(json)}})); true;`);
  }, []);

  // ref API
  useImperativeHandle(ref, () => ({
    setCenter: (lat, lng, level) => send({ type: 'setCenter', latitude: lat, longitude: lng, level }),
  }), [send]);

  // markers prop 변경 시 동기화
  //   배열 identity만 바뀌고 내용이 같은 경우(리렌더)에는 WebView 왕복 자체를 생략한다.
  const markerSigRef = useRef<string>('');
  useEffect(() => {
    const sig = props.markers
      .map(m => `${m.id}|${m.latitude}|${m.longitude}|${m.variant}|${m.label}`)
      .join(';');
    if (sig === markerSigRef.current) return;
    markerSigRef.current = sig;
    send({ type: 'setMarkers', markers: props.markers });
  }, [props.markers, send]);

  // 사용자 위치 변경 시
  useEffect(() => {
    if (props.userLocation) {
      send({ type: 'setUserLocation', latitude: props.userLocation.latitude, longitude: props.userLocation.longitude });
    }
  }, [props.userLocation, send]);

  // 선택된 ID 변경 시
  useEffect(() => {
    send({ type: 'selectMarker', id: props.selectedId });
  }, [props.selectedId, send]);

  const html = buildKakaoMapHtml({
    appKey: KAKAO_JS_KEY,
    initialLatitude: props.initialLatitude,
    initialLongitude: props.initialLongitude,
    initialLevel: props.initialLevel,
  });

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        isReadyRef.current = true;
        // 큐에 쌓인 메시지 flush
        const pending = pendingRef.current.slice();
        pendingRef.current = [];
        pending.forEach(p => send(p));
        // 초기 markers 즉시 동기화
        send({ type: 'setMarkers', markers: props.markers });
        if (props.userLocation) {
          send({ type: 'setUserLocation', latitude: props.userLocation.latitude, longitude: props.userLocation.longitude });
        }
        props.onReady?.();
      } else if (data.type === 'markerClick') {
        props.onMarkerClick?.(data.id);
      } else if (data.type === 'clusterClick') {
        props.onClusterClick?.(Array.isArray(data.ids) ? data.ids : []);
      } else if (data.type === 'mapClick') {
        props.onMapClick?.();
      } else if (data.type === 'regionChange') {
        props.onRegionChange?.(data.latitude, data.longitude, data.level);
      }
    } catch (e) {
      console.warn('KakaoMap message parse error:', e);
    }
  }, [props, send]);

  if (!KAKAO_JS_KEY) {
    return (
      <View style={[styles.fallback, props.style]}>
        {/* @ts-ignore */}
        <View style={styles.fallbackInner}>
          {/* 키 미설정 안내 */}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, props.style]}>
      <WebView
        ref={webRef}
        // baseUrl 필수: 없으면 WebView origin이 about:blank → 카카오 JS SDK가
        // 등록 도메인 검증에서 거부해 지도가 빈 화면이 됨. 카카오 콘솔의
        // JS SDK 도메인에 등록된 도메인(웹 데모와 동일)을 origin으로 사용.
        source={{ html, baseUrl: 'https://dogear-demo.vercel.app' }}
        originWhitelist={['*']}
        // 메인 프레임 이동은 지도 렌더링에 필요 없다. 카카오 SDK가 오류 페이지로
        // 튀거나 콘텐츠가 링크를 물고 나가는 경우를 차단한다.
        // (스크립트·이미지 같은 하위 리소스는 이 콜백을 타지 않으므로 지도는 그대로 동작)
        onShouldStartLoadWithRequest={shouldAllowNavigation}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        style={styles.webview}
        scalesPageToFit={false}
        setSupportMultipleWindows={false}
        bounces={false}
        scrollEnabled={false}
        // 안드로이드: 하드웨어 가속 + Mixed content (kakao SDK는 http 호출 가능)
        mixedContentMode={Platform.OS === 'android' ? 'always' : undefined}
        allowsInlineMediaPlayback
      />
    </View>
  );
});

export default KakaoMap;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.tertiary },
  webview: { flex: 1, backgroundColor: 'transparent' },
  fallback: { flex: 1, backgroundColor: Colors.bg.tertiary, alignItems: 'center', justifyContent: 'center' },
  fallbackInner: { padding: 20 },
});
