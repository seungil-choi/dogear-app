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
    .pin {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translateY(-100%);
    }
    .pin-dot {
      width: 28px; height: 28px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 13px;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }
    .pin-default { background: #9C9B97; }
    .pin-visited { background: #7BA08B; }
    .pin-regular { background: #C47848; }
    .pin-selected {
      width: 36px; height: 36px;
      transform: scale(1.15);
      box-shadow: 0 4px 10px rgba(196,120,72,0.4);
    }
    .pin-label {
      margin-top: 4px;
      max-width: 110px;
      padding: 3px 8px;
      background: rgba(255,255,255,0.95);
      border-radius: 12px;
      color: #1A1612;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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

      function pinHtml(id, label, variant, selected) {
        var icon = variant === 'regular' ? '★' : '🐾';
        var cls = 'pin-dot pin-' + (variant || 'default') + (selected ? ' pin-selected' : '');
        return '<div class="pin" data-marker-id="' + escapeHtml(id) + '">' +
                 '<div class="' + cls + '">' + icon + '</div>' +
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
