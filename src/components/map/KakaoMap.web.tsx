/**
 * 카카오맵 컴포넌트 (웹: 직접 Kakao JS API 사용)
 *
 * iframe 없이 같은 페이지의 div에 카카오맵 렌더 → 성능/UX 최적
 */

import React, {
  useImperativeHandle, useRef, forwardRef, useEffect, useCallback, useState,
} from 'react';
import { Colors } from '@/constants/tokens';
import type { KakaoMapProps, KakaoMapRef, KakaoMarker } from './KakaoMap';

const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

// 동적으로 카카오 SDK 스크립트 로드 (한 번만)
let kakaoLoadPromise: Promise<any> | null = null;
function loadKakaoSdk(appKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('SSR');
  if ((window as any).kakao?.maps) return Promise.resolve((window as any).kakao);
  if (kakaoLoadPromise) return kakaoLoadPromise;

  kakaoLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => {
      (window as any).kakao.maps.load(() => resolve((window as any).kakao));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return kakaoLoadPromise;
}

const VARIANT_BG = {
  default: '#9C9B97',
  visited: '#7BA08B',
  regular: '#C47848',
} as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] as string);
}

function pinHtml(id: string, label: string, variant: KakaoMarker['variant'], selected: boolean): string {
  const icon = variant === 'regular' ? '★' : '🐾';
  const sizeStyle = selected
    ? 'width:36px;height:36px;box-shadow:0 4px 10px rgba(196,120,72,0.4);transform:scale(1.15);'
    : 'width:28px;height:28px;box-shadow:0 2px 6px rgba(0,0,0,0.25);';
  return `
    <div data-marker-id="${escapeHtml(id)}" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-100%);pointer-events:auto;">
      <div style="${sizeStyle}border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;border:2px solid #fff;background:${VARIANT_BG[variant]}">${icon}</div>
      <div style="margin-top:4px;max-width:110px;padding:3px 8px;background:rgba(255,255,255,0.95);border-radius:12px;color:#1A1612;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,0.1)">${escapeHtml(label)}</div>
    </div>
  `;
}

const KakaoMap = forwardRef<KakaoMapRef, KakaoMapProps>(function KakaoMap(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Map<string, any>>(new Map());
  const userOverlayRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // 초기화
  useEffect(() => {
    if (!KAKAO_JS_KEY) return;
    if (!containerRef.current) return;

    let cancelled = false;
    loadKakaoSdk(KAKAO_JS_KEY).then((kakao) => {
      if (cancelled || !containerRef.current) return;

      const center = new kakao.maps.LatLng(
        props.initialLatitude ?? 37.5563,
        props.initialLongitude ?? 126.9237
      );
      const map = new kakao.maps.Map(containerRef.current, {
        center,
        level: props.initialLevel ?? 4,
      });
      mapRef.current = map;

      // 빈 영역 클릭
      kakao.maps.event.addListener(map, 'click', () => {
        props.onMapClick?.();
      });

      // 영역 변경
      kakao.maps.event.addListener(map, 'dragend', () => {
        const c = map.getCenter();
        props.onRegionChange?.(c.getLat(), c.getLng(), map.getLevel());
      });

      setReady(true);
      props.onReady?.();
    }).catch((err) => {
      console.error('Kakao SDK load failed:', err);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // markers 동기화
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const kakao = (window as any).kakao;
    if (!kakao) return;

    // 기존 overlay 제거
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current.clear();

    props.markers.forEach((m) => {
      const isSelected = m.id === props.selectedId;
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(m.latitude, m.longitude),
        content: pinHtml(m.id, m.label, m.variant, isSelected),
        yAnchor: 1,
        clickable: true,
      });
      overlay.setMap(mapRef.current);
      overlaysRef.current.set(m.id, overlay);
    });

    // 클릭 핸들러: data-marker-id 셀렉터로 정확히 타겟팅
    // (cursor:pointer는 카카오 자체 컨트롤도 매치되어 인덱싱이 어긋남)
    const attachClicks = () => {
      const els = containerRef.current?.querySelectorAll<HTMLElement>('[data-marker-id]');
      els?.forEach((el) => {
        const id = el.dataset.markerId;
        if (!id) return;
        el.onclick = (e) => {
          e.stopPropagation();
          props.onMarkerClick?.(id);
        };
      });
    };
    // 카카오맵 DOM 렌더링 타이밍 보장 (setTimeout + requestAnimationFrame)
    requestAnimationFrame(() => {
      attachClicks();
      // 한 번 더 — 일부 브라우저에서 첫 RAF 직후 DOM 미반영 케이스 대비
      setTimeout(attachClicks, 100);
    });
  }, [ready, props.markers, props.selectedId, props.onMarkerClick]);

  // 사용자 위치
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!props.userLocation) return;
    const kakao = (window as any).kakao;
    const pos = new kakao.maps.LatLng(props.userLocation.latitude, props.userLocation.longitude);
    if (userOverlayRef.current) {
      userOverlayRef.current.setPosition(pos);
    } else {
      userOverlayRef.current = new kakao.maps.CustomOverlay({
        position: pos,
        content: '<div style="width:18px;height:18px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 0 4px rgba(66,133,244,0.25)"></div>',
        yAnchor: 0.5, xAnchor: 0.5,
        zIndex: 5,
      });
      userOverlayRef.current.setMap(mapRef.current);
    }
  }, [ready, props.userLocation]);

  // ref API
  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lng: number, level?: number) => {
      if (!mapRef.current) return;
      const kakao = (window as any).kakao;
      const pos = new kakao.maps.LatLng(lat, lng);
      if (level != null) mapRef.current.setLevel(level);
      mapRef.current.panTo(pos);
    },
  }), []);

  if (!KAKAO_JS_KEY) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: Colors.bg.tertiary, color: Colors.text.tertiary, fontSize: 13, padding: 20, textAlign: 'center' }}>
        카카오맵 키가 설정되지 않았어요.
        <br />
        EXPO_PUBLIC_KAKAO_JS_KEY 환경변수를 설정해주세요.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', background: Colors.bg.tertiary, ...(props.style as any) }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
});

export default KakaoMap;
