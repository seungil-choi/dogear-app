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

// 동적으로 카카오 SDK 스크립트 로드 (한 번만) — clusterer 라이브러리 포함
let kakaoLoadPromise: Promise<any> | null = null;
function loadKakaoSdk(appKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('SSR');
  if ((window as any).kakao?.maps?.MarkerClusterer) return Promise.resolve((window as any).kakao);
  if (kakaoLoadPromise) return kakaoLoadPromise;

  kakaoLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=clusterer`;
    script.async = true;
    script.onload = () => {
      (window as any).kakao.maps.load(() => resolve((window as any).kakao));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return kakaoLoadPromise;
}

// 줌 레벨 임계값 — 이 값 이상(멀리)이면 클러스터, 이하(가까이)면 디테일 핀
// (카카오: 1 = 가장 가까움, 14 = 가장 멀음)
const CLUSTER_LEVEL = 6;

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

// 마커 내부 아이콘
const PAW_PATH = `<path d="M12 2 C 9.5 2 7.8 4 7.8 6.5 C 7.8 9 9.5 11 12 11 C 14.5 11 16.2 9 16.2 6.5 C 16.2 4 14.5 2 12 2 Z M 5 7 C 3.3 7 2 8.5 2 10.3 C 2 12.1 3.3 13.5 5 13.5 C 6.7 13.5 8 12.1 8 10.3 C 8 8.5 6.7 7 5 7 Z M 19 7 C 17.3 7 16 8.5 16 10.3 C 16 12.1 17.3 13.5 19 13.5 C 20.7 13.5 22 12.1 22 10.3 C 22 8.5 20.7 7 19 7 Z" fill="#fff"/>`;
const STAR_PATH = `<polygon points="12 5 14.5 11 21 11.3 16 15.5 17.5 22 12 18.5 6.5 22 8 15.5 3 11.3 9.5 11 12 5" fill="#fff"/>`;

/**
 * tail-pin SVG 마커
 *  - 핀의 BOTTOM TIP이 LatLng에 정확히 위치 (yAnchor:1 사용)
 *  - 라벨은 absolute로 핀 아래에 배치 → 좌표 정렬에 영향 X
 *  - 라벨 풀네임 노출 (white-space:normal, max-width 확대)
 */
function pinHtml(id: string, label: string, variant: KakaoMarker['variant'], selected: boolean): string {
  const iconPath = variant === 'regular' ? STAR_PATH : PAW_PATH;
  // viewBox 32x40 = 4:5 비율을 정확히 유지해야 핀이 stretch 안 됨
  const w = selected ? 36 : 28;
  const h = selected ? 45 : 35;   // 28:35 = 36:45 = 4:5 (viewBox와 동일)
  const fill = VARIANT_BG[variant];
  const shadow = selected
    ? 'filter:drop-shadow(0 4px 8px rgba(196,120,72,0.45));'
    : 'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28));';
  // SVG 자체 사이즈 명시 + preserveAspectRatio로 비율 강제 + CSS 사이즈 재명시 (카카오 컨테이너 stretch 방지)
  const pinSvg = `
    <svg width="${w}" height="${h}" viewBox="0 0 32 40" preserveAspectRatio="xMidYMid meet"
         style="display:block;width:${w}px;height:${h}px;${shadow}">
      <path d="M16 0 C 7.2 0 0 7.2 0 16 C 0 23 8 31 16 40 C 24 31 32 23 32 16 C 32 7.2 24.8 0 16 0 Z"
            fill="${fill}" stroke="#fff" stroke-width="2.5"/>
      <g transform="translate(4,4) scale(${(w === 36 ? 1.0 : 0.85)})">${iconPath}</g>
    </svg>
  `;
  // 컨테이너에 width/height 모두 명시 → 카카오 CustomOverlay가 width:100% 등으로 stretch 못 함
  return `
    <div data-marker-id="${escapeHtml(id)}" style="position:relative;cursor:pointer;pointer-events:auto;width:${w}px;height:${h}px;">
      ${pinSvg}
      <div style="position:absolute;top:100%;left:50%;transform:translate(-50%,3px);max-width:140px;padding:3px 8px;background:rgba(255,255,255,0.96);border-radius:10px;color:#1A1612;font-size:11px;line-height:14px;font-weight:600;white-space:normal;text-align:center;word-break:keep-all;box-shadow:0 1px 3px rgba(0,0,0,0.18);pointer-events:none;">${escapeHtml(label)}</div>
    </div>
  `;
}

const KakaoMap = forwardRef<KakaoMapRef, KakaoMapProps>(function KakaoMap(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Map<string, any>>(new Map());          // 디테일 모드 (CustomOverlay)
  const markersRef = useRef<Map<string, any>>(new Map());           // 클러스터 모드 (Marker)
  const clustererRef = useRef<any>(null);                            // MarkerClusterer 인스턴스
  const userOverlayRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(props.initialLevel ?? 4);

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

      // 클러스터러 초기화 (도그이어 톤)
      clustererRef.current = new kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: CLUSTER_LEVEL,            // 이 레벨 이상에서만 클러스터링 시작
        minClusterSize: 2,                  // 2개 이상 모일 때만 클러스터
        disableClickZoom: false,            // 클러스터 클릭 시 자동 줌인
        styles: [
          // 단계별 스타일 — 카운트에 따라 자동 적용
          { width: 36, height: 36, background: 'rgba(196,120,72,0.92)', color: '#fff', textAlign: 'center', lineHeight: '36px', borderRadius: '50%', fontWeight: '700', fontSize: '12px', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' },
          { width: 44, height: 44, background: 'rgba(196,120,72,0.92)', color: '#fff', textAlign: 'center', lineHeight: '44px', borderRadius: '50%', fontWeight: '700', fontSize: '13px', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.22)' },
          { width: 52, height: 52, background: 'rgba(196,120,72,0.92)', color: '#fff', textAlign: 'center', lineHeight: '52px', borderRadius: '50%', fontWeight: '800', fontSize: '14px', border: '2px solid #fff', boxShadow: '0 3px 10px rgba(0,0,0,0.24)' },
          { width: 60, height: 60, background: 'rgba(196,120,72,0.92)', color: '#fff', textAlign: 'center', lineHeight: '60px', borderRadius: '50%', fontWeight: '800', fontSize: '15px', border: '2px solid #fff', boxShadow: '0 3px 12px rgba(0,0,0,0.26)' },
        ],
        calculator: [10, 50, 100],          // 1~9 / 10~49 / 50~99 / 100+ 단계
      });

      // 빈 영역 클릭
      kakao.maps.event.addListener(map, 'click', () => {
        props.onMapClick?.();
      });

      // 영역 변경
      kakao.maps.event.addListener(map, 'dragend', () => {
        const c = map.getCenter();
        props.onRegionChange?.(c.getLat(), c.getLng(), map.getLevel());
      });

      // 줌 변경 — 디테일/클러스터 모드 전환 트리거
      kakao.maps.event.addListener(map, 'zoom_changed', () => {
        setZoomLevel(map.getLevel());
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

  // markers 동기화 — 줌 레벨에 따라 디테일/클러스터 분기
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const kakao = (window as any).kakao;
    if (!kakao) return;

    const isCluster = zoomLevel >= CLUSTER_LEVEL;

    // 양쪽 모드 모두 정리 (재구성 전에)
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current.clear();
    if (clustererRef.current) {
      clustererRef.current.clear();
    }
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current.clear();

    if (isCluster) {
      // ── 클러스터 모드 — 일반 Marker + Clusterer ──
      const markers = props.markers.map((m) => {
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(m.latitude, m.longitude),
          clickable: true,
        });
        kakao.maps.event.addListener(marker, 'click', () => {
          props.onMarkerClick?.(m.id);
        });
        markersRef.current.set(m.id, marker);
        return marker;
      });
      clustererRef.current?.addMarkers(markers);
      return;
    }

    // ── 디테일 모드 — CustomOverlay tail-pin (라벨 풀네임) ──
    props.markers.forEach((m) => {
      const isSelected = m.id === props.selectedId;
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(m.latitude, m.longitude),
        content: pinHtml(m.id, m.label, m.variant, isSelected),
        xAnchor: 0.5,
        yAnchor: 1.0,
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
  }, [ready, props.markers, props.selectedId, props.onMarkerClick, zoomLevel]);

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
