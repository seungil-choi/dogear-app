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
      /* 라벨은 26px짜리 핀(.pin, position:relative) 안의 absolute 요소라
         폭을 지정하지 않으면 컨테이닝 블록(26px)에 갇혀 두 글자씩 세로로 접힌다.
         max-width만으로는 상한만 정해질 뿐 갇힌 폭이 넓어지지 않으므로
         width:max-content로 내용 기준 폭을 잡고 max-width로 상한을 둔다. */
      width: max-content;
      max-width: 132px;
      padding: 3px 8px;
      background: rgba(255,255,255,0.96);
      border-radius: 10px;
      color: #1A1612;
      font-size: 11px;
      line-height: 14px;
      font-weight: 600;
      white-space: normal;
      text-align: center;
      /* 한국어는 어절 단위로 끊고, 끊을 데 없는 긴 이름만 예외적으로 강제 줄바꿈 */
      word-break: keep-all;
      overflow-wrap: anywhere;
      /* 최대 2줄 — 더 길면 말줄임 */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.18);
      pointer-events: none;
    }
    /* 클러스터 뱃지 — 겹친 핀을 개수로 묶어 보여준다 */
    .cluster {
      border-radius: 50%;
      background: #FF7A30;
      border: 2.5px solid #fff;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.28);
      cursor: pointer;
      pointer-events: auto;
      box-sizing: border-box;
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

      // 오버레이 1개 생성 (lat/lng를 넘기면 그 위치에 — spiderfy 펼침용)
      function createOverlay(item, lat, lng) {
        var overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(
            lat != null ? lat : item.latitude,
            lng != null ? lng : item.longitude
          ),
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

      // ── 클러스터링 ────────────────────────────────────────────────
      //  왜 필요한가:
      //   1) 원천 데이터에 **서로 다른 공원이 같은 좌표**에 찍힌 묶음이 55곳 있다
      //      (지구 대표좌표를 쓴 탓). 겹쳐서 하나만 보이고 나머지는 누를 수 없다.
      //   2) 줌아웃하면 최대 150개 핀이 한 화면에 몰려 오버레이 생성 비용이 크다.
      //  겹친 핀은 숫자 뱃지로 묶고, 확대하면 풀린다.
      //  좌표가 사실상 동일해 확대해도 안 풀리는 묶음은 탭하면 방사형으로 펼친다(spiderfy).

      var allItems = [];        // RN이 내려준 전체 마커
      var clusterById = {};     // key -> { overlay, count }
      var spiderKey = null;     // 현재 펼쳐진 클러스터 key

      // 클러스터링을 적용할 최소 축소 레벨.
      //   카카오는 레벨이 클수록 축소. 이 레벨보다 확대된 상태(=레벨이 작음)에서는
      //   좌표가 사실상 같은 묶음만 뭉치고, 떨어져 있는 핀은 절대 합치지 않는다.
      //   (확대했는데 멀쩡하던 핀이 합쳐지는 문제 방지)
      var CLUSTER_MIN_LEVEL = 7;

      // 레벨이 클수록(축소) 격자를 넓게 — 화면상 묶임 간격을 일정하게 유지
      function gridDeg() { return 0.00004 * Math.pow(2, map ? map.getLevel() : 4); }

      // 좌표가 사실상 동일한 것만 묶기 위한 아주 촘촘한 격자(약 5m)
      var TIGHT_GRID = 0.00005;
      function activeGrid() {
        var lv = map ? map.getLevel() : 4;
        return lv >= CLUSTER_MIN_LEVEL ? gridDeg() : TIGHT_GRID;
      }

      function groupKeyOf(item, g) {
        return Math.round(item.latitude / g) + ':' + Math.round(item.longitude / g);
      }

      function clusterHtml(key, count) {
        var size = count < 10 ? 34 : (count < 50 ? 40 : 46);
        return '<div class="cluster" data-cluster-key="' + escapeHtml(key) + '" ' +
               'style="width:' + size + 'px;height:' + size + 'px;line-height:' + size + 'px;">' +
               count + '</div>';
      }

      /** 묶음 내 좌표가 사실상 동일한가(확대해도 안 풀리는가) */
      function isTight(list) {
        var la0 = list[0].latitude, ln0 = list[0].longitude;
        for (var i = 1; i < list.length; i++) {
          if (Math.abs(list[i].latitude - la0) > 0.00005 ||
              Math.abs(list[i].longitude - ln0) > 0.00005) return false;
        }
        return true;   // 약 5m 이내
      }

      /** 현재 줌 기준으로 개별 핀 / 클러스터를 계산해 화면과 동기화 */
      function renderMarkers() {
        if (!map) return;
        var g = activeGrid();

        // 1) 그룹핑
        var groups = {};
        allItems.forEach(function(item) {
          var k = groupKeyOf(item, g);
          (groups[k] || (groups[k] = [])).push(item);
        });

        // 2) 이번 렌더에서 개별 핀으로 보여줄 것 / 클러스터로 묶을 것 결정
        var wantPins = {};      // id -> {item, offset?}
        var wantClusters = {};  // key -> {count, lat, lng}
        Object.keys(groups).forEach(function(k) {
          var list = groups[k];
          var expanded = (k === spiderKey);
          // 선택된 핀이 든 묶음은 항상 펼친다 — 목록 카드와 지도가 어긋나지 않게
          var hasSelected = selectedId && list.some(function(it) { return it.id === selectedId; });

          if (list.length === 1 || expanded || hasSelected) {
            if (list.length > 1 && (expanded || hasSelected) && isTight(list)) {
              // 좌표가 겹쳐 그냥 두면 서로 가려진다 → 원형으로 펼침
              var r = g * 0.8;
              list.forEach(function(it, i) {
                var a = (2 * Math.PI * i) / list.length;
                wantPins[it.id] = { item: it, dLat: r * Math.sin(a), dLng: r * Math.cos(a) };
              });
            } else {
              list.forEach(function(it) { wantPins[it.id] = { item: it, dLat: 0, dLng: 0 }; });
            }
          } else {
            var sLa = 0, sLn = 0;
            list.forEach(function(it) { sLa += it.latitude; sLn += it.longitude; });
            wantClusters[k] = { count: list.length, lat: sLa / list.length, lng: sLn / list.length };
          }
        });

        // 3) 개별 핀 diff
        Object.keys(markerById).forEach(function(id) {
          if (!wantPins[id]) { markerById[id].overlay.setMap(null); delete markerById[id]; }
        });
        Object.keys(wantPins).forEach(function(id) {
          var w = wantPins[id], item = w.item;
          var lat = item.latitude + (w.dLat || 0), lng = item.longitude + (w.dLng || 0);
          var entry = markerById[id];
          if (!entry) {
            markerById[id] = { overlay: createOverlay(item, lat, lng), item: item, lat: lat, lng: lng };
            return;
          }
          if (entry.lat !== lat || entry.lng !== lng) {
            entry.overlay.setPosition(new kakao.maps.LatLng(lat, lng));
            entry.lat = lat; entry.lng = lng;
          }
          if (entry.item.label !== item.label || entry.item.variant !== item.variant) {
            entry.overlay.setContent(pinHtml(item.id, item.label, item.variant, item.id === selectedId));
          }
          entry.item = item;
        });

        // 4) 클러스터 diff
        Object.keys(clusterById).forEach(function(k) {
          if (!wantClusters[k]) { clusterById[k].overlay.setMap(null); delete clusterById[k]; }
        });
        Object.keys(wantClusters).forEach(function(k) {
          var c = wantClusters[k], entry = clusterById[k];
          if (!entry) {
            var ov = new kakao.maps.CustomOverlay({
              position: new kakao.maps.LatLng(c.lat, c.lng),
              content: clusterHtml(k, c.count),
              xAnchor: 0.5, yAnchor: 0.5, clickable: true,
            });
            ov.setMap(map);
            clusterById[k] = { overlay: ov, count: c.count };
            return;
          }
          if (entry.count !== c.count) {
            entry.overlay.setContent(clusterHtml(k, c.count));
            entry.count = c.count;
          }
          entry.overlay.setPosition(new kakao.maps.LatLng(c.lat, c.lng));
        });

        markers = Object.keys(markerById).map(function(id) { return markerById[id].overlay; });
      }

      /** RN이 마커 목록을 내려줄 때 */
      function setMarkers(items) {
        allItems = items || [];
        // 사라진 스팟이 펼침 상태였다면 해제
        if (spiderKey && !allItems.length) spiderKey = null;
        renderMarkers();
      }

      // 클릭은 위임(delegation) 1회 등록 — 마커가 바뀔 때마다 재바인딩하지 않는다.
      document.addEventListener('click', function(e) {
        if (!e.target || !e.target.closest) return;

        var cl = e.target.closest('[data-cluster-key]');
        if (cl) {
          e.stopPropagation();
          var key = cl.getAttribute('data-cluster-key');
          var g = activeGrid(), list = [];
          allItems.forEach(function(it) { if (groupKeyOf(it, g) === key) list.push(it); });
          if (!list.length) return;
          var sLa = 0, sLn = 0;
          list.forEach(function(it) { sLa += it.latitude; sLn += it.longitude; });
          var center = new kakao.maps.LatLng(sLa / list.length, sLn / list.length);

          if (isTight(list) || map.getLevel() <= 1) {
            // 확대해도 안 풀리는 묶음 → 그 자리에서 펼친다
            spiderKey = key;
            renderMarkers();
          } else {
            spiderKey = null;
            map.setLevel(Math.max(1, map.getLevel() - 2), { anchor: center });
            renderMarkers();
          }
          return;
        }

        var el = e.target.closest('[data-marker-id]');
        if (!el) return;
        var id = el.getAttribute('data-marker-id');
        if (!id) return;
        e.stopPropagation();
        postMsg({ type: 'markerClick', id: id });
      }, true);

      function selectMarker(id) {
        var prev = selectedId;
        selectedId = id;
        // 선택이 클러스터 안에 있으면 그 묶음을 펼쳐야 하므로 전체 재계산.
        // 그 외에는 최대 2개만 다시 그린다.
        var needsRerender = false;
        if (id && !markerById[id]) needsRerender = true;
        if (needsRerender) { renderMarkers(); return; }
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

        // 클릭(빈 영역) — 핀 닫기 신호 + 펼쳐둔 클러스터 접기
        kakao.maps.event.addListener(map, 'click', function() {
          if (spiderKey) { spiderKey = null; renderMarkers(); }
          postMsg({ type: 'mapClick' });
        });

        // 영역 변경 — 알림
        kakao.maps.event.addListener(map, 'dragend', function() {
          var c = map.getCenter();
          postMsg({ type: 'regionChange', latitude: c.getLat(), longitude: c.getLng(), level: map.getLevel() });
        });

        // 줌 변경 — 클러스터를 다시 계산하고 RN에도 알린다.
        //   이전에는 dragend만 있어서 줌아웃해도 RN의 zoomLevel이 갱신되지 않았고,
        //   그 결과 넓은 반경 재조회가 트리거되지 않아 "줌아웃하면 핀이 안 늘어나는" 문제가 있었다.
        kakao.maps.event.addListener(map, 'zoom_changed', function() {
          // 펼침 상태는 유지한다. 줌마다 접으면 "확대했더니 핀이 도로 합쳐지는" 것처럼 보인다.
          renderMarkers();
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
