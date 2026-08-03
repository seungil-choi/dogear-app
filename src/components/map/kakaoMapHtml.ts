/**
 * 카카오 맵 HTML 템플릿
 *
 * Native: WebView의 source.html로 사용
 * Web: iframe srcDoc 또는 직접 DOM에 주입
 *
 * 통신 프로토콜 (postMessage):
 *   App → Map:
 *     { type: 'setCenter', latitude, longitude, level? }
 *     { type: 'setMarkers', markers: [{ id, latitude, longitude, label, variant }] }
 *     { type: 'setUserLocation', latitude, longitude }
 *     { type: 'selectMarker', id }
 *   Map → App:
 *     { type: 'ready' }
 *     { type: 'markerClick', id }
 *     { type: 'mapClick' }
 *     { type: 'regionChange', latitude, longitude, level }
 */

export interface KakaoMapInitOpts {
  /** 카카오 JavaScript 키 */
  appKey: string;
  /** 초기 위도 */
  initialLatitude?: number;
  /** 초기 경도 */
  initialLongitude?: number;
  /** 초기 줌 레벨 (1 가장 가까움 ~ 14 가장 멀음, 기본 4) */
  initialLevel?: number;
}

export function buildKakaoMapHtml(opts: KakaoMapInitOpts): string {
  const lat = opts.initialLatitude ?? 37.5563;
  const lng = opts.initialLongitude ?? 126.9237;
  const level = opts.initialLevel ?? 4;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
  <title>DogEar Map</title>
  <style>
    html, body { margin:0; padding:0; height:100%; width:100%; overflow:hidden; background:#F5F3EF; }
    #map { width:100%; height:100%; }
    /* tail-pin SVG: 꼬리 끝이 좌표(yAnchor:1) */
    .pin { position: relative; cursor: pointer; pointer-events: auto; }
    .pin-svg { display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.28)); }
    .pin-svg-selected { filter: drop-shadow(0 4px 8px rgba(196,120,72,0.45)); }
    .pin-label {
      position: absolute;
      top: 100%; left: 50%;
      transform: translate(-50%, 3px);
      max-width: 140px;
      padding: 3px 8px;
      background: rgba(255,255,255,0.96);
      border-radius: 10px;
      color: #1A1612;
      font-size: 11px;
      line-height: 14px;
      font-weight: 600;
      white-space: normal;
      text-align: center;
      word-break: keep-all;
      box-shadow: 0 1px 3px rgba(0,0,0,0.18);
      pointer-events: none;
    }
    /* 사용자 위치 — 외곽 링 + 내부 점 (브랜드 컬러로 통일) */
    .user-loc-wrap {
      position: relative; width: 32px; height: 32px;
      pointer-events: none;
    }
    .user-loc-ring {
      position: absolute; left: 0; top: 0;
      width: 32px; height: 32px;
      border-radius: 50%;
      background: rgba(196,120,72,0.18);
    }
    .user-loc-dot {
      position: absolute; left: 50%; top: 50%;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #FF7A30;
      border: 3px solid #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.28);
      transform: translate(-50%, -50%);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=${opts.appKey}&autoload=false"></script>
  <script>
    (function() {
      var markers = [];
      var markerById = {};
      var userMarker = null;
      var map = null;
      var selectedId = null;

      function postMsg(payload) {
        var json = JSON.stringify(payload);
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(json);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(json, '*');
        }
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
          return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
      }

      // status별 핀 시각
      //   default(안 가본 곳)는 흰 배경 + 브랜드 외곽선 — 디테일 모드(가까이)에서만 노출
      //   클러스터 모드(level>=6)에서는 모두 숫자 클러스터로 통합되어 단일 dot 미노출
      var VARIANT_STYLE = {
        regular: { fill: '#FF7A30', stroke: '#fff',    icon: 'fill'  },
        visited: { fill: '#D89678', stroke: '#fff',    icon: 'fill'  },
        default: { fill: '#FFFFFF', stroke: '#FF7A30', icon: 'brand' },
      };
      var STAR_PATH  = '<polygon points="12 4 14.6 9.5 21 10 16.2 14.4 17.6 21 12 17.6 6.4 21 7.8 14.4 3 10 9.4 9.5 12 4"/>';
      var CHECK_PATH = '<polyline points="6 12 10 16 18 8" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
      var DOT_PATH   = '<circle cx="12" cy="12" r="3.5"/>';

      function pinHtml(id, label, variant, selected) {
        var v = VARIANT_STYLE[variant || 'default'];
        var iconPath = variant === 'regular' ? STAR_PATH
                     : variant === 'visited' ? CHECK_PATH
                     : DOT_PATH;
        var size = selected ? 32 : 26;       // 정사각형 — 원형 dot
        var iconColor = v.icon === 'brand' ? '#FF7A30' : '#fff';
        var iconAttrs = variant === 'visited'
          ? 'fill="none" stroke="' + iconColor + '"'
          : 'fill="' + iconColor + '"';
        var sw = selected ? 2.2 : 1.8;
        var cls = 'pin-svg' + (selected ? ' pin-svg-selected' : '');
        // 원형 dot — viewBox 24x24 정사각형
        var pinSvg = '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="-1.5 -1.5 27 27" preserveAspectRatio="xMidYMid meet" style="width:' + size + 'px;height:' + size + 'px;overflow:visible;">' +
          '<circle cx="12" cy="12" r="11" fill="' + v.fill + '" stroke="' + v.stroke + '" stroke-width="' + sw + '"/>' +
          '<g ' + iconAttrs + '>' + iconPath + '</g>' +
        '</svg>';
        return '<div class="pin" data-marker-id="' + escapeHtml(id) + '" style="width:' + size + 'px;height:' + size + 'px;overflow:visible;">' +
                 pinSvg +
                 '<div class="pin-label">' + escapeHtml(label || '') + '</div>' +
               '</div>';
      }

      // 오버레이 1개 생성
      function createOverlay(item) {
        var overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(item.latitude, item.longitude),
          content: pinHtml(item.id, item.label, item.variant, item.id === selectedId),
          xAnchor: 0.5,
          yAnchor: 0.5,           // 원형 dot — 중심이 LatLng
          clickable: true,
        });
        overlay.setMap(map);
        return overlay;
      }

      // 핀 1개만 다시 그린다(선택 강조 등). 전체 재생성 대비 압도적으로 싸다.
      function repaint(id) {
        var entry = markerById[id];
        if (!entry) return;
        entry.overlay.setContent(
          pinHtml(entry.item.id, entry.item.label, entry.item.variant, id === selectedId)
        );
      }

      /**
       * 마커 동기화 — diff 방식.
       *
       * 이전 구현은 팬/선택 때마다 전체 오버레이를 파괴 후 재생성해(최대 150개)
       * 지도가 눈에 띄게 버벅였다. 지금은 실제로 바뀐 것만 건드린다.
       *   - 사라진 핀만 제거 / 새 핀만 생성
       *   - 남아있는 핀은 좌표·라벨·variant가 바뀐 경우에만 갱신
       */
      function setMarkers(items) {
        var next = {};
        items.forEach(function(item) { next[item.id] = item; });

        // 1) 사라진 핀 제거
        Object.keys(markerById).forEach(function(id) {
          if (!next[id]) {
            markerById[id].overlay.setMap(null);
            delete markerById[id];
          }
        });

        // 2) 추가 / 변경
        items.forEach(function(item) {
          var entry = markerById[item.id];
          if (!entry) {
            markerById[item.id] = { overlay: createOverlay(item), item: item };
            return;
          }
          var prev = entry.item;
          if (prev.latitude !== item.latitude || prev.longitude !== item.longitude) {
            entry.overlay.setPosition(new kakao.maps.LatLng(item.latitude, item.longitude));
          }
          if (prev.label !== item.label || prev.variant !== item.variant) {
            entry.overlay.setContent(
              pinHtml(item.id, item.label, item.variant, item.id === selectedId)
            );
          }
          entry.item = item;
        });

        markers = Object.keys(markerById).map(function(id) { return markerById[id].overlay; });
      }

      // 클릭은 위임(delegation) 1회 등록 — 마커가 바뀔 때마다 재바인딩하지 않는다.
      document.addEventListener('click', function(e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-marker-id]') : null;
        if (!el) return;
        var id = el.getAttribute('data-marker-id');
        if (!id) return;
        e.stopPropagation();
        postMsg({ type: 'markerClick', id: id });
      }, true);

      function selectMarker(id) {
        var prev = selectedId;
        selectedId = id;
        // 이전 선택 + 새 선택, 최대 2개만 다시 그린다
        if (prev && prev !== id) repaint(prev);
        if (id) repaint(id);
      }

      function setCenter(lat, lng, lv) {
        if (!map) return;
        var pos = new kakao.maps.LatLng(lat, lng);
        if (lv != null) map.setLevel(lv);
        map.panTo(pos);
      }

      // 사용자 위치 표시 — 외곽 링 + 내부 점 (브랜드 컬러)
      function setUserLocation(lat, lng) {
        if (!map) return;
        var pos = new kakao.maps.LatLng(lat, lng);
        var html = '<div class="user-loc-wrap">' +
                     '<div class="user-loc-ring"></div>' +
                     '<div class="user-loc-dot"></div>' +
                   '</div>';
        if (userMarker) {
          userMarker.setPosition(pos);
        } else {
          userMarker = new kakao.maps.CustomOverlay({
            position: pos,
            content: html,
            xAnchor: 0.5, yAnchor: 0.5,
            zIndex: 5,
          });
          userMarker.setMap(map);
        }
      }

      // 메시지 수신 (RN/iframe 양쪽 대응)
      function handleMessage(event) {
        var data = event.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch(e) { return; }
        }
        if (!data || !data.type) return;
        if (data.type === 'setCenter') setCenter(data.latitude, data.longitude, data.level);
        else if (data.type === 'setMarkers') setMarkers(data.markers || []);
        else if (data.type === 'setUserLocation') setUserLocation(data.latitude, data.longitude);
        else if (data.type === 'selectMarker') selectMarker(data.id);
      }
      window.addEventListener('message', handleMessage);
      document.addEventListener('message', handleMessage); // iOS WebView

      // 카카오맵 초기화
      kakao.maps.load(function() {
        var container = document.getElementById('map');
        var options = {
          center: new kakao.maps.LatLng(${lat}, ${lng}),
          level: ${level},
        };
        map = new kakao.maps.Map(container, options);

        // 클릭(빈 영역) — 핀 닫기 신호
        kakao.maps.event.addListener(map, 'click', function() {
          postMsg({ type: 'mapClick' });
        });

        // 영역 변경 — 디바운스 후 알림
        var dbTimer = null;
        kakao.maps.event.addListener(map, 'dragend', function() {
          var c = map.getCenter();
          postMsg({ type: 'regionChange', latitude: c.getLat(), longitude: c.getLng(), level: map.getLevel() });
        });

        postMsg({ type: 'ready' });
      });
    })();
  </script>
</body>
</html>`;
}
