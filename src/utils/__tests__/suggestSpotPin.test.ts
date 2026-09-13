/**
 * 장소 등록 — 중앙 고정 핀은 **지도의 정중앙**을 가리켜야 한다.
 *
 * 무슨 일이 있었나 (2026-09-13):
 *   사용자가 직접 등록한 장소("홍천 연아네 할머니집")의 상세 지도가 어긋난다는 신고.
 *   데이터는 멀쩡했다 — 저장된 좌표와 저장된 주소가 서로 맞았다. 그런데 그 주소는
 *   저장된 좌표를 역지오코딩한 값이라, 둘이 맞는 건 당연했다(순환 검증이었다).
 *
 *   진짜 문제는 등록 화면이었다. 저장되는 좌표는 `onRegionChange`가 주는
 *   **지도의 정중앙**인데, 화면에 그려지는 핀은 정중앙에 없었다:
 *
 *     mapPinOverlay: { ...inset 0, justifyContent:'center', paddingBottom: 20 }
 *       → 자식들이 (높이-20)의 가운데에 놓여 **10px 위로** 밀린다
 *     자식 = [핀 그림 40px] + [점 8px, marginTop:-4]
 *       → 그룹 높이 44, 점의 중심은 그룹 위에서 40px 지점
 *       → 점의 중심이 지도 중심보다 **8px 아래**
 *
 *   사용자는 점을 집에 맞췄지만 저장된 좌표는 그보다 북쪽이었다.
 *   오차는 세로(남북)로만 생긴다 — 가로는 padding이 없어 정확했다.
 *
 * 규칙:
 *   오버레이는 지도와 같은 상자를 덮고 가운데 정렬만 한다(padding·margin·offset 금지).
 *   기준점은 `mapPinDot`이고, 핀 그림은 그 위에 absolute로 매단다.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../app/suggest-spot.tsx'),
  'utf8',
);

/** `이름: { ... }` 스타일 블록 한 덩어리를 꺼낸다 */
function styleBlock(name: string): string {
  const m = SRC.match(new RegExp(`\\n  ${name}: \\{([\\s\\S]*?)\\n  \\},`));
  return m?.[1] ?? '';
}

describe('저장되는 좌표는 지도의 정중앙이다', () => {
  it('지도가 멈춘 뒤의 중심(onCenterSettle)을 핀 좌표로 쓴다 — dragend(onRegionChange)가 아니다', () => {
    expect(SRC).toMatch(/onCenterSettle=\{onSettle\}/);
    expect(SRC).toMatch(/onSettle=\{\(lat, lng\) =>\s*\n\s*setPinLocation\(/);
    expect(SRC).not.toMatch(/onRegionChange=/);
  });

  it('제출 payload는 pinLocation을 쓴다 — 현재 위치가 아니다', () => {
    expect(SRC).toMatch(/latitude: pinLocation\.latitude/);
    expect(SRC).toMatch(/longitude: pinLocation\.longitude/);
  });
});

describe('중앙 고정 핀은 그 정중앙에 그려진다', () => {
  const overlay = styleBlock('mapPinOverlay');
  const dot = styleBlock('mapPinDot');

  it('오버레이는 지도와 같은 상자를 덮는다', () => {
    expect(overlay).toMatch(/position: 'absolute'/);
    expect(overlay).toMatch(/top: 0, left: 0, right: 0, bottom: 0/);
  });

  it('오버레이는 가운데 정렬만 한다', () => {
    expect(overlay).toMatch(/alignItems: 'center'/);
    expect(overlay).toMatch(/justifyContent: 'center'/);
  });

  it('오버레이에 중심을 밀어내는 값이 없다 — 이게 8px 어긋남의 원인이었다', () => {
    expect(overlay).not.toMatch(/padding/);
    expect(overlay).not.toMatch(/margin/);
    expect(overlay).not.toMatch(/transform|translate/);
  });

  it('기준점(점)에도 중심을 미는 값이 없다', () => {
    expect(dot.length).toBeGreaterThan(0);
    expect(dot).not.toMatch(/margin/);
    expect(dot).not.toMatch(/top:|bottom:|transform|translate/);
  });

  it('핀 그림은 기준점 위에 매달린다 — 그림이 바뀌어도 기준점은 안 움직인다', () => {
    const icon = styleBlock('mapPinIcon');
    expect(icon).toMatch(/position: 'absolute'/);
    expect(icon).toMatch(/bottom: PIN_DOT_SIZE \/ 2/);
    expect(icon).toMatch(/left: \(PIN_DOT_SIZE - PIN_ICON_SIZE\) \/ 2/);
  });

  it('오버레이의 직계 자식은 기준점 하나뿐이다 — 형제가 생기면 다시 밀린다', () => {
    // 오버레이 여는 태그 바로 다음에 오는 첫 요소가 기준점이어야 하고,
    // 그 뒤로 형제 요소 없이 오버레이가 닫혀야 한다.
    expect(SRC).toMatch(
      /<View style=\{s\.mapPinOverlay\} pointerEvents="none">\s*\n\s*<View style=\{s\.mapPinDot\}>/,
    );
    const jsx = SRC.match(
      /<View style=\{s\.mapPinOverlay\} pointerEvents="none">([\s\S]*?)\n {16}<\/View>/,
    )?.[1] ?? '';
    expect(jsx.length).toBeGreaterThan(0);
    // 기준점 자신 + 그림 래퍼. 그 이상이면 형제가 붙은 것이다.
    expect((jsx.match(/<View /g) ?? []).length).toBe(2);
  });
});

/**
 * 핀이 '거의 안 움직이던' 문제 (2026-09-13)
 *
 *   ① 폼 ScrollView가 세로 드래그를 가로채 지도 드래그가 취소됐다(안드로이드).
 *   ② 시작 좌표 prop이 바뀌면 WebView가 새로 로드돼 옮겨 둔 지도가 튀어 돌아갔다.
 *   ③ 단계를 오가 지도가 다시 마운트되면 진입 시점 좌표로 열려 핀이 사라질 수 있었다.
 */
describe('핀 지도는 스크롤 안에서도 제스처를 갖고, 옮긴 위치를 잃지 않는다', () => {
  const picker = SRC.match(/function PinPickerMap\([\s\S]*?\n\}\n/)?.[0] ?? '';

  it('PinPickerMap이 있고 등록 화면이 그것을 쓴다', () => {
    expect(picker.length).toBeGreaterThan(0);
    expect(SRC).toMatch(/<PinPickerMap\s*\n\s*start=\{pinLocation\}/);
    // 화면 본문에서 KakaoMap을 직접 쓰지 않는다 — 규칙이 한 곳에 모이도록
    const body = SRC.slice(SRC.indexOf('export default function SuggestSpotScreen'));
    expect(body).not.toMatch(/<KakaoMap/);
  });

  it('① 스크롤 안에서 제스처를 지도가 가져간다', () => {
    expect(picker).toMatch(/nestedScrollEnabled/);
  });

  it('② 시작점은 마운트 순간 한 번만 정한다 — 이후 prop이 바뀌어도 다시 로드하지 않는다', () => {
    expect(picker).toMatch(/const \[origin\] = useState\(start\)/);
    expect(picker).toMatch(/initialLatitude=\{origin\.latitude\}/);
    expect(picker).toMatch(/initialLongitude=\{origin\.longitude\}/);
    // currentLocation을 시작 좌표로 넘기면 늦은 위치 갱신이 지도를 되돌린다
    expect(SRC).not.toMatch(/initialLatitude=\{location\.latitude\}/);
  });

  it('③ 다시 마운트되면 진입 시점이 아니라 지금 핀에서 연다', () => {
    expect(SRC).toMatch(/start=\{pinLocation\}/);
  });
});

/**
 * 현재 위치로 핀 옮기기 (2026-09-13)
 *   "지도든 어디든 현재 좌표 기준으로 지정하는 기능이 필요하다"는 요청.
 *
 * 규칙: 버튼은 **핀이 아니라 지도를 옮긴다.** 지도가 멈추면 idle → onSettle로 핀이 정해진다.
 *       핀을 정하는 길이 둘이 되면 화면의 핀과 저장될 좌표가 다시 어긋날 수 있다.
 */
describe('현재 위치로 핀 옮기기', () => {
  const picker = SRC.match(/function PinPickerMap\([\s\S]*?\n\}\n/)?.[0] ?? '';
  const locate = picker.match(/const locate = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/)?.[1] ?? '';

  it('버튼이 지도 위에 있고 문구는 messages에서 온다', () => {
    expect(locate.length).toBeGreaterThan(0);
    expect(picker).toMatch(/onPress=\{locate\}/);
    expect(picker).toMatch(/accessibilityLabel=\{SUGGEST\.locateLabel\}/);
  });

  it('핀을 직접 바꾸지 않고 지도를 옮긴다', () => {
    expect(locate).toMatch(/mapRef\.current\?\.setCenter\(/);
    expect(locate).not.toMatch(/setPinLocation|onSettle\(/);
  });

  it('위치 취득은 타임아웃과 함께 — 없으면 실내에서 버튼이 영영 잠긴다', () => {
    expect(locate).toMatch(/withTimeout\(\s*\n?\s*Location\.getCurrentPositionAsync/);
    expect(locate).toMatch(/LOCATION_TIMEOUT_MS\.USER_ACTION/);
  });

  it('권한은 요청하지 않고 설정으로 안내한다 — 탐색 탭과 같다', () => {
    expect(locate).toMatch(/getForegroundPermissionsAsync/);
    expect(locate).not.toMatch(/requestForegroundPermissionsAsync/);
    expect(locate).toMatch(/Linking\.openSettings\(\)/);
  });

  it('누르는 동안 다시 누를 수 없고, 끝나면 반드시 풀린다', () => {
    expect(locate).toMatch(/if \(isLocating\) return;/);
    expect(locate).toMatch(/finally \{\s*\n\s*setIsLocating\(false\);/);
  });
});
