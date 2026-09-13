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
  it('onRegionChange가 준 중심을 그대로 핀 좌표로 쓴다', () => {
    expect(SRC).toMatch(/onRegionChange=\{\(lat, lng\) =>\s*\n?\s*setPinLocation\(\{ latitude: lat, longitude: lng \}\)/);
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
