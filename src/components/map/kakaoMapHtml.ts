/**
 * 카카오 맵 HTML 템플릿
 *
 * Native: WebView의 source.html로 사용
 * Web: iframe srcDoc 또는 직접 DOM에 주입
 *
 * 통신 프로토콜 (postMessage):
 *   App → Map:
 *     { type: 'setCenter', latitude, longitude, level? }
 *     { type: 'fitBounds', points: [{lat,lng}], padBottom? }
 *     { type: 'setMarkers', markers: [{ id, latitude, longitude, label, variant }] }
 *       variant = 나와의 관계. 유형은 핀으로 구분하지 않는다.
 *     { type: 'setUserLocation', latitude, longitude }
 *     { type: 'selectMarker', id }
 *   Map → App:
 *     { type: 'ready' }
 *     { type: 'markerClick', id }
 *     { type: 'clusterClick', key, ids }   // 묶인 장소들을 목록으로 펼쳐 보여달라는 신호
 *     { type: 'mapClick' }
 *     { type: 'regionChange', latitude, longitude, level }
 */

import { CLUSTER_GRID_JS } from './clusterGrid';

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
      /* 상한을 좁게 잡는다. 132px일 때 "호펫 강아지 고양이 성신여대본점" 같은 이름이
         화면 가로의 1/3을 차지해 핀 몇 개만 모여도 지도가 라벨로 덮였다.
         라벨은 어느 핀인지 알아보는 단서지 이름을 다 읽는 자리가 아니다 —
         넘치는 부분은 아래 line-clamp가 말줄임으로 처리한다. */
      max-width: 96px;
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
    /* 목록을 펼쳐둔 클러스터 — 지도에서 어느 묶음을 보고 있는지 알 수 있게 */
    .cluster-active {
      background: #E05A0F;
      box-shadow: 0 0 0 5px rgba(255,122,48,0.28), 0 2px 6px rgba(0,0,0,0.28);
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
        visited: { fill: '#FF6A2D', stroke: '#fff',    icon: 'fill'  },   // Deep Orange (Colors.pin.visited)
        default: { fill: '#FFFFFF', stroke: '#FF7A30', icon: 'brand' },
      };
      var STAR_PATH  = '<polygon points="12 4 14.6 9.5 21 10 16.2 14.4 17.6 21 12 17.6 6.4 21 7.8 14.4 3 10 9.4 9.5 12 4"/>';
      // 발도장 남긴 곳 — 체크(✓)는 '완료' 의미라 이 서비스의 언어가 아니다. 발자국으로 바꾼다.
      var PAW_PATH   = '<path d="M8.2 9.6c-1.05 0-1.9-1.02-1.9-2.28S7.15 5.04 8.2 5.04s1.9 1.02 1.9 2.28S9.25 9.6 8.2 9.6zm7.6 0c-1.05 0-1.9-1.02-1.9-2.28s.85-2.28 1.9-2.28 1.9 1.02 1.9 2.28S16.85 9.6 15.8 9.6zM4.6 14.1c-.95 0-1.7-.92-1.7-2.05s.76-2.05 1.7-2.05 1.7.92 1.7 2.05-.76 2.05-1.7 2.05zm14.8 0c-.95 0-1.7-.92-1.7-2.05s.76-2.05 1.7-2.05 1.7.92 1.7 2.05-.76 2.05-1.7 2.05zM12 11.4c2.3 0 5.1 2.5 5.1 4.9 0 1.6-1.2 2.5-2.7 2.5-.9 0-1.7-.35-2.4-.35s-1.5.35-2.4.35c-1.5 0-2.7-.9-2.7-2.5 0-2.4 2.8-4.9 5.1-4.9z"/>';
      var DOT_PATH   = '<circle cx="12" cy="12" r="3.5"/>';


      // 핀은 '내가 다녀왔는가'만 말한다. 유형(병원·미용·호텔)은 핀으로 구분하지 않는다 —
      // 탐색 중에 중요한 건 관계지 업종이 아니다. 유형은 카드·상세의 아이콘이 담당한다.
      function pinHtml(id, label, variant, selected) {
        var v = VARIANT_STYLE[variant || 'default'];
        var iconPath = variant === 'regular' ? STAR_PATH
                     : variant === 'visited' ? PAW_PATH
                     : DOT_PATH;
        var size = selected ? 32 : 26;       // 정사각형 — 원형 dot
        var iconColor = v.icon === 'brand' ? '#FF7A30' : '#fff';
        var iconAttrs = 'fill="' + iconColor + '"';
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

      // 오버레이 1개 생성 (lat/lng를 넘기면 그 위치에)
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
      //  겹친 핀은 숫자 뱃지로 묶는다.
      //  ⚠️ 클러스터를 푸는 유일한 방법은 **확대(줌인)** 뿐이다.
      //     탭으로 방사형 펼치기(spiderfy)나 자동 확대를 하던 시절에는
      //     "확대했더니 멀쩡히 떨어져 있던 핀이 도로 합쳐진다"는 착시가 났다.
      //     지금은 탭하면 묶인 장소들을 **하단 목록**으로 넘긴다(clusterClick).
      //     좌표가 완전히 겹쳐 확대해도 안 풀리는 묶음(지구 대표좌표 55곳)도
      //     그 목록을 통해 전부 도달할 수 있다.

      var allItems = [];        // RN이 내려준 전체 마커
      var clusterById = {};     // key -> { overlay, count, active }
      var activeClusterKey = null;   // 목록을 펼쳐둔 클러스터(강조 표시용)
      var openClusterKey   = null;   // 탭해서 개별 핀으로 푼 클러스터

      // 격자 규칙은 clusterGrid.ts에 한 벌만 두고 여기에 그대로 주입한다.
      //   → 같은 코드를 유닛 테스트(clusterGrid.test.ts)가 평가해
      //     "확대는 묶음을 쪼개기만 한다"는 성질을 고정한다.
      //   제공: GRID_BASE, CLUSTER_MIN_LEVEL, activeGridFor(level), groupKeyOf(lat, lng, g)
${CLUSTER_GRID_JS}

      function activeGrid() {
        return activeGridFor(map ? map.getLevel() : 4);
      }

      function clusterHtml(key, count, active) {
        var size = count < 10 ? 34 : (count < 50 ? 40 : 46);
        return '<div class="cluster' + (active ? ' cluster-active' : '') + '" ' +
               'data-cluster-key="' + escapeHtml(key) + '" ' +
               'style="width:' + size + 'px;height:' + size + 'px;line-height:' + size + 'px;">' +
               count + '</div>';
      }

      /** 현재 줌 기준으로 개별 핀 / 클러스터를 계산해 화면과 동기화 */
      function renderMarkers() {
        if (!map) return;
        var g = activeGrid();

        // 1) 그룹핑
        var groups = {};
        allItems.forEach(function(item) {
          var k = groupKeyOf(item.latitude, item.longitude, g);
          (groups[k] || (groups[k] = [])).push(item);
        });

        // 2) 이번 렌더에서 개별 핀으로 보여줄 것 / 클러스터로 묶을 것 결정
        //    묶인 것은 어떤 경우에도 여기서 풀지 않는다 — 푸는 건 오직 줌인.
        var wantPins = {};      // id -> {item}
        var wantClusters = {};  // key -> {count, lat, lng, active}
        Object.keys(groups).forEach(function(k) {
          var list = groups[k];
          // 탭해서 연 묶음은 개별 핀으로 푼다. 숫자핀을 눌렀는데 숫자핀이 그대로면
          // "눌렀는데 아무 일도 안 났다"가 된다.
          if (list.length === 1 || k === openClusterKey) {
            list.forEach(function(it) { wantPins[it.id] = { item: it }; });
            return;
          }
          var sLa = 0, sLn = 0, hasSelected = false;
          list.forEach(function(it) {
            sLa += it.latitude; sLn += it.longitude;
            if (selectedId && it.id === selectedId) hasSelected = true;
          });
          wantClusters[k] = {
            count: list.length,
            lat: sLa / list.length,
            lng: sLn / list.length,
            // 목록을 펼쳐둔 묶음, 또는 선택한 장소가 든 묶음을 강조
            active: (k === activeClusterKey) || hasSelected,
          };
        });

        // 3) 개별 핀 diff
        Object.keys(markerById).forEach(function(id) {
          if (!wantPins[id]) { markerById[id].overlay.setMap(null); delete markerById[id]; }
        });
        Object.keys(wantPins).forEach(function(id) {
          var item = wantPins[id].item;
          var lat = item.latitude, lng = item.longitude;
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
              content: clusterHtml(k, c.count, c.active),
              xAnchor: 0.5, yAnchor: 0.5, clickable: true,
            });
            ov.setMap(map);
            clusterById[k] = { overlay: ov, count: c.count, active: c.active };
            return;
          }
          if (entry.count !== c.count || entry.active !== c.active) {
            entry.overlay.setContent(clusterHtml(k, c.count, c.active));
            entry.count = c.count;
            entry.active = c.active;
          }
          entry.overlay.setPosition(new kakao.maps.LatLng(c.lat, c.lng));
        });

        markers = Object.keys(markerById).map(function(id) { return markerById[id].overlay; });
      }

      /** RN이 마커 목록을 내려줄 때 */
      function setMarkers(items) {
        allItems = items || [];
        if (!allItems.length) { activeClusterKey = null; openClusterKey = null; }
        renderMarkers();
      }

      // 클릭은 위임(delegation) 1회 등록 — 마커가 바뀔 때마다 재바인딩하지 않는다.
      document.addEventListener('click', function(e) {
        if (!e.target || !e.target.closest) return;

        var cl = e.target.closest('[data-cluster-key]');
        if (cl) {
          e.stopPropagation();
          // 클러스터는 탭으로 풀지 않는다(확대만이 푼다).
          // 대신 묶인 장소들의 id를 넘겨 하단 목록에 그대로 펼쳐 보여준다.
          var key = cl.getAttribute('data-cluster-key');
          var g = activeGrid(), ids = [];
          allItems.forEach(function(it) {
            if (groupKeyOf(it.latitude, it.longitude, g) === key) ids.push(it.id);
          });
          if (!ids.length) return;
          activeClusterKey = key;
          openClusterKey = key;      // 이 묶음을 개별 핀으로 편다
          renderMarkers();
          postMsg({ type: 'clusterClick', key: key, ids: ids });
          return;
        }

        var el = e.target.closest('[data-marker-id]');
        if (!el) return;
        var id = el.getAttribute('data-marker-id');
        if (!id) return;
        e.stopPropagation();
        activeClusterKey = null; openClusterKey = null;
        postMsg({ type: 'markerClick', id: id });
      }, true);

      function selectMarker(id) {
        var prev = selectedId;
        selectedId = id;
        // 선택이 클러스터 안팎을 오갈 때만 전체 재계산(강조 이동).
        // 그 외에는 최대 2개만 다시 그린다.
        if ((id && !markerById[id]) || (prev && !markerById[prev])) {
          renderMarkers();
          return;
        }
        if (prev && prev !== id) repaint(prev);
        if (id) repaint(id);
      }

      function setCenter(lat, lng, lv) {
        if (!map) return;
        var pos = new kakao.maps.LatLng(lat, lng);
        if (lv != null) map.setLevel(lv);
        map.panTo(pos);
      }

      /**
       * 여러 지점을 한 화면에 담는다 — 클러스터(숫자 핀)를 눌렀을 때 쓴다.
       *
       * 고정 배율로 줌인하지 않는 이유:
       *   흩어진 무리는 한 단계로 안 풀리고, 한 건물에 몰린 무리는 아무리 당겨도 안 풀린다.
       *   경계에 맞추면 배율을 고를 필요 없이 두 경우가 알아서 처리된다.
       *
       * padBottom: 바텀시트가 지도 하단을 가리므로 그만큼 비워 둔다.
       *            (안 그러면 핀이 시트 뒤에 숨어 "눌렀는데 안 보인다"가 된다)
       */
      /**
       * 여러 지점을 한 화면에 담는다 — 클러스터(숫자 핀)를 눌렀을 때 쓴다.
       *
       * setBounds는 **즉시 점프**해서 어디로 들어왔는지 눈으로 못 따라간다.
       * 단계적으로 배율을 낮추며 애니메이션으로 들어간다.
       */
      function fitBounds(pts, padBottom) {
        if (!map || !pts || !pts.length) return;
        var pb = padBottom != null ? padBottom : 40;

        var cLa = 0, cLn = 0;
        pts.forEach(function(p) { cLa += p.lat; cLn += p.lng; });
        var center = new kakao.maps.LatLng(cLa / pts.length, cLn / pts.length);


        var target;
        if (pts.length === 1) {
          target = CLUSTER_MIN_LEVEL - 1;
        } else {
          var b = new kakao.maps.LatLngBounds();
          pts.forEach(function(p) { b.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
          var before = map.getLevel();
          map.setBounds(b, 48, 48, pb, 48);      // 목표 배율만 계산
          target = map.getLevel();
          if (target >= CLUSTER_MIN_LEVEL) target = CLUSTER_MIN_LEVEL - 1;
          if (target < 1) target = 1;
          map.setLevel(before);                   // 되돌린 뒤 애니메이션으로 다시 간다
        }

        map.panTo(center);
        map.setLevel(target, { animate: { duration: 350 } });

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
        if (data.type === 'setCenter') { setCenter(data.latitude, data.longitude, data.level); }
        else if (data.type === 'fitBounds') fitBounds(data.points, data.padBottom);
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

        // 클릭(빈 영역) — 핀 닫기 신호 + 클러스터 강조 해제
        kakao.maps.event.addListener(map, 'click', function() {
          if (activeClusterKey || openClusterKey) { activeClusterKey = null; openClusterKey = null; renderMarkers(); }
          postMsg({ type: 'mapClick' });
        });

        // 영역 변경 — 알림. 지도를 옮기면 펼쳐둔 클러스터 목록은 맥락을 잃으므로 해제.
        kakao.maps.event.addListener(map, 'dragend', function() {
          if (activeClusterKey || openClusterKey) { activeClusterKey = null; openClusterKey = null; renderMarkers(); }
          var c = map.getCenter();
          postMsg({ type: 'regionChange', latitude: c.getLat(), longitude: c.getLng(), level: map.getLevel() });
        });

        // 줌 변경 — 클러스터를 다시 계산하고 RN에도 알린다.
        //   이전에는 dragend만 있어서 줌아웃해도 RN의 zoomLevel이 갱신되지 않았고,
        //   그 결과 넓은 반경 재조회가 트리거되지 않아 "줌아웃하면 핀이 안 늘어나는" 문제가 있었다.
        //   확대하면 격자가 좁아져 묶음이 자연스럽게 풀린다 — 클러스터가 풀리는 유일한 경로.
        kakao.maps.event.addListener(map, 'zoom_changed', function() {
          activeClusterKey = null; openClusterKey = null;
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
