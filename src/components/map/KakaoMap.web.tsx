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

// status별 핀 시각 정의 — 브랜드 spectrum 안에서 단계 표현 (통일감)
//   regular: 진한 브랜드 = 자주 가는 곳 (★ 별)
//   visited: 중간 브랜드 = 발도장 남긴 곳 (✓ 체크)
//   default: 흰 배경 + 브랜드 외곽선 = 아직 안 가본 곳 (• 점)
const VARIANT_STYLE = {
  regular: { fill: '#C47848', icon: 'fill', stroke: '#fff' },
  visited: { fill: '#D89678', icon: 'fill', stroke: '#fff' },
  default: { fill: '#FFFFFF', icon: 'brand', stroke: '#C47848' },
} as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] as string);
}

// 마커 내부 아이콘 — status별로 의미 명확 (작은 사이즈에서도 인식 쉬움)
//   STAR_PATH: 단골 (★)
//   CHECK_PATH: 발도장 남긴 곳 (✓)
//   DOT_PATH: 안 가본 곳 (•)
const STAR_PATH  = `<polygon points="12 4 14.6 9.5 21 10 16.2 14.4 17.6 21 12 17.6 6.4 21 7.8 14.4 3 10 9.4 9.5 12 4"/>`;
const CHECK_PATH = `<polyline points="6 12 10 16 18 8" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const DOT_PATH   = `<circle cx="12" cy="12" r="3.5"/>`;

/**
 * tail-pin SVG 마커
 *  - 핀의 BOTTOM TIP이 LatLng에 정확히 위치 (yAnchor:1 사용)
 *  - 라벨은 absolute로 핀 아래에 배치 → 좌표 정렬에 영향 X
 *  - 라벨 풀네임 노출 (white-space:normal, max-width 확대)
 */
function pinHtml(id: string, label: string, variant: KakaoMarker['variant'], selected: boolean): string {
  const v = VARIANT_STYLE[variant];
  const iconPath =
    variant === 'regular' ? STAR_PATH :
    variant === 'visited' ? CHECK_PATH :
    DOT_PATH;
  // viewBox 24x32 = 3:4 — 위는 큰 원, 아래로 좁은 꼬리 (Google Maps 스타일)
  // 선택 시 1.2배 + 그림자 강화로 status에 관계없이 강조
  const w = selected ? 33 : 27;
  const h = selected ? 44 : 36;   // 27:36 = 33:44 = 3:4 (viewBox와 동일)
  const shadow = selected
    ? 'filter:drop-shadow(0 5px 10px rgba(0,0,0,0.35));'
    : 'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.22));';
  // 아이콘 색상: fill variant는 흰색, brand variant(default 안 가본 곳)는 브랜드 컬러
  const iconColor = v.icon === 'brand' ? '#C47848' : '#fff';
  const strokeWidth = selected ? 2.2 : 1.8;
  // CHECK_PATH는 stroke 기반이라 fill 대신 stroke 색만 사용
  const iconAttrs = variant === 'visited'
    ? `fill="none" stroke="${iconColor}"`
    : `fill="${iconColor}"`;
  // viewBox 패딩 추가 (-1.5 ~ 25.5 / 33.5) — stroke가 viewBox 안에 완전히 포함됨
  // overflow:visible 백업 — 일부 환경에서 SVG가 stroke를 잘라내는 케이스 방지
  const pinSvg = `
    <svg width="${w}" height="${h}" viewBox="-1.5 -1.5 27 35" preserveAspectRatio="xMidYMid meet"
         style="display:block;width:${w}px;height:${h}px;overflow:visible;${shadow}">
      <path d="M 12 0 C 5.4 0 0 5.4 0 12 C 0 14.7 1 17 2.5 19.3 L 12 32 L 21.5 19.3 C 23 17 24 14.7 24 12 C 24 5.4 18.6 0 12 0 Z"
            fill="${v.fill}" stroke="${v.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
      <g ${iconAttrs}>${iconPath}</g>
    </svg>
  `;
  // 컨테이너 overflow:visible — 카카오 CustomOverlay가 잘라내지 않도록 명시
  return `
    <div data-marker-id="${escapeHtml(id)}" style="position:relative;cursor:pointer;pointer-events:auto;width:${w}px;height:${h}px;overflow:visible;">
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
