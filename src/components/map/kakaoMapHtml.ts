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
    .user-loc {
      width: 18px; height: 18px;
      border-radius: 50%;
      background: #4285F4;
      border: 3px solid #fff;
      box-shadow: 0 0 0 4px rgba(66,133,244,0.25);
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

      var VARIANT_BG = { default: '#9C9B97', visited: '#7BA08B', regular: '#C47848' };
      var PAW_PATH = '<path d="M12 2 C 9.5 2 7.8 4 7.8 6.5 C 7.8 9 9.5 11 12 11 C 14.5 11 16.2 9 16.2 6.5 C 16.2 4 14.5 2 12 2 Z M 5 7 C 3.3 7 2 8.5 2 10.3 C 2 12.1 3.3 13.5 5 13.5 C 6.7 13.5 8 12.1 8 10.3 C 8 8.5 6.7 7 5 7 Z M 19 7 C 17.3 7 16 8.5 16 10.3 C 16 12.1 17.3 13.5 19 13.5 C 20.7 13.5 22 12.1 22 10.3 C 22 8.5 20.7 7 19 7 Z" fill="#fff"/>';
      var STAR_PATH = '<polygon points="12 5 14.5 11 21 11.3 16 15.5 17.5 22 12 18.5 6.5 22 8 15.5 3 11.3 9.5 11 12 5" fill="#fff"/>';

      function pinHtml(id, label, variant, selected) {
        var iconPath = variant === 'regular' ? STAR_PATH : PAW_PATH;
        var w = selected ? 36 : 28;
        var h = selected ? 46 : 36;
        var fill = VARIANT_BG[variant || 'default'];
        var cls = 'pin-svg' + (selected ? ' pin-svg-selected' : '');
        var pinSvg = '<svg class="' + cls + '" width="' + w + '" height="' + h + '" viewBox="0 0 32 40">' +
          '<path d="M16 0 C 7.2 0 0 7.2 0 16 C 0 23 8 31 16 40 C 24 31 32 23 32 16 C 32 7.2 24.8 0 16 0 Z" fill="' + fill + '" stroke="#fff" stroke-width="2.5"/>' +
          '<g transform="translate(4,4)' + (selected ? '' : ' scale(0.85)') + '">' + iconPath + '</g>' +
        '</svg>';
        return '<div class="pin" data-marker-id="' + escapeHtml(id) + '" style="width:' + w + 'px;">' +
                 pinSvg +
                 '<div class="pin-label">' + escapeHtml(label || '') + '</div>' +
               '</div>';
      }

      function clearMarkers() {
        markers.forEach(function(m) { m.setMap(null); });
        markers = [];
        markerById = {};
      }

      function setMarkers(items) {
        clearMarkers();
        items.forEach(function(item) {
          var pos = new kakao.maps.LatLng(item.latitude, item.longitude);
          var content = pinHtml(item.id, item.label, item.variant, item.id === selectedId);
          var overlay = new kakao.maps.CustomOverlay({
            position: pos,
            content: content,
            yAnchor: 1,
            clickable: true,
          });
          overlay.setMap(map);
          markers.push(overlay);
          markerById[item.id] = { overlay: overlay, item: item };
        });
        // 클릭 처리: data-marker-id로 정확 타겟팅
        requestAnimationFrame(function() {
          bindMarkerClicks();
          setTimeout(bindMarkerClicks, 100);
        });
      }

      function bindMarkerClicks() {
        document.querySelectorAll('[data-marker-id]').forEach(function(el) {
          var id = el.getAttribute('data-marker-id');
          if (!id) return;
          el.onclick = function(e) {
            e.stopPropagation();
            postMsg({ type: 'markerClick', id: id });
          };
        });
      }

      function selectMarker(id) {
        selectedId = id;
        if (markerById[id]) {
          var item = markerById[id].item;
          // 선택된 핀만 다시 그려서 강조
          // 단순히 모든 핀 재렌더 (성능 OK 50개 이하)
          var items = Object.values(markerById).map(function(m) { return m.item; });
          setMarkers(items);
        }
      }

      function setCenter(lat, lng, lv) {
        if (!map) return;
        var pos = new kakao.maps.LatLng(lat, lng);
        if (lv != null) map.setLevel(lv);
        map.panTo(pos);
      }

      function setUserLocation(lat, lng) {
        if (!map) return;
        var pos = new kakao.maps.LatLng(lat, lng);
        if (userMarker) {
          userMarker.setPosition(pos);
        } else {
          userMarker = new kakao.maps.CustomOverlay({
            position: pos,
            content: '<div class="user-loc"></div>',
            yAnchor: 0.5, xAnchor: 0.5,
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
