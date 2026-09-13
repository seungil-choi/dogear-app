/**
 * 장소 등록 — 자동 주소를 그 자리에서 고칠 수 있다. 원칙은 **핀 우선**.
 *
 * 왜 (2026-09-13):
 *   「홍천 연아네 할머니집」. 핀은 모곡리 166-1에 정확히 있었는데, 기기 역지오코딩이
 *   옆 필지 167-2를 적었다. 사용자는 틀린 줄 알면서 제출하고, 따로 수정 제안을 넣고,
 *   승인을 기다려야 했다. 필지가 큰 곳에서는 반복된다.
 *
 * 핀 우선 (2026-09-13 결정):
 *   - 좌표는 사용자가 눈으로 맞춘 핀이 정한다. 주소는 그 핀에 붙는 이름표다.
 *   - 주소를 고쳐도 핀은 움직이지 않는다.
 *   - 핀을 옮기면 직접 고친 주소는 버리고 자동 주소로 돌아간다(새 핀의 이름표가 아니므로).
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'app/suggest-spot.tsx'), 'utf8');
const MSG = fs.readFileSync(path.join(ROOT, 'src/constants/messages.ts'), 'utf8');

function callbackBody(name: string): string {
  return SRC.match(new RegExp(`const ${name} = useCallback\\(\\(\\) => \\{([\\s\\S]*?)\\n  \\}, \\[`))?.[1] ?? '';
}

describe('직접 고친 주소가 제출 값이 된다', () => {
  it('제출 주소 우선순위: 직접 입력 > 자동 주소 > 제출 직전 조회', () => {
    const block = SRC.match(/const manualText = manualAddress\?\.text\.trim\(\);([\s\S]*?);\n/)?.[0] ?? '';
    expect(block.length).toBeGreaterThan(0);
    const iManual = block.indexOf('manualText\n      ?');
    const iAuto = block.indexOf(': resolvedAddress');
    const iLookup = block.indexOf('await lookupAddress');
    expect(iManual).toBeGreaterThan(-1);
    expect(iAuto).toBeGreaterThan(iManual);
    expect(iLookup).toBeGreaterThan(iAuto);
  });

  it('제출 콜백이 manualAddress 변화를 본다 — 빠지면 옛 주소로 제출된다', () => {
    expect(SRC).toMatch(/photoUri, resolvedAddress, manualAddress\]\);/);
  });

  it('직접 고친 주소도 부적절 표현 검사를 거친다 — 장소 상세에 그대로 노출된다', () => {
    expect(SRC).toMatch(/address: !!manualAddress && isObjectionable\(manualAddress\.text\)/);
    expect(SRC).toMatch(/nextBlocked\.name \|\| nextBlocked\.description \|\| nextBlocked\.address/);
  });
});

describe('핀 우선', () => {
  it('주소를 고쳐도 핀은 움직이지 않는다', () => {
    const start = callbackBody('startAddressEdit');
    const commit = callbackBody('commitAddressEdit');
    expect(start.length).toBeGreaterThan(0);
    expect(commit.length).toBeGreaterThan(0);
    expect(start).not.toMatch(/setPinLocation/);
    expect(commit).not.toMatch(/setPinLocation/);
  });

  it('고친 주소는 그때의 핀에 묶인다', () => {
    expect(callbackBody('commitAddressEdit')).toMatch(/at: pinLocation/);
  });

  it('비우거나 자동 주소와 같게 두면 직접 입력으로 치지 않는다', () => {
    expect(callbackBody('commitAddressEdit')).toMatch(/text && text !== resolvedAddress \? \{ text, at: pinLocation \} : null/);
  });

  it('핀이 벗어나면 직접 고친 주소를 버리고 알린다', () => {
    const effect = SRC.match(/useEffect\(\(\) => \{\n    if \(!manualAddress\) return;([\s\S]*?)\n  \}, \[([^\]]*)\]\);/);
    expect(effect).not.toBeNull();
    const [, body, deps] = effect!;
    expect(body).toMatch(/haversineDistance\(/);
    expect(body).toMatch(/if \(moved <= MANUAL_ADDRESS_KEEP_M\) return;/);
    expect(body).toMatch(/setManualAddress\(null\)/);
    expect(body).toMatch(/setAddressResetNotice\(true\)/);
    expect(deps).toMatch(/pinLocation\.latitude/);
    expect(deps).toMatch(/pinLocation\.longitude/);
  });

  it('버리는 거리는 0보다 크다 — 지도가 다시 열릴 때의 부동소수점 차이로 주소가 사라지면 안 된다', () => {
    const m = SRC.match(/const MANUAL_ADDRESS_KEEP_M = (\d+(?:\.\d+)?);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    expect(Number(m![1])).toBeLessThanOrEqual(10);   // 크면 진짜로 옮긴 핀에 옛 주소가 남는다
  });
});

describe('문구는 messages.ts에서 온다 (문서 19)', () => {
  const keys = ['addressEdit', 'addressEditDone', 'addressEditHint', 'addressPlaceholder', 'addressManualTag', 'addressResetByPin'];

  it.each(keys)('SUGGEST.%s가 있고 화면이 쓴다', (key) => {
    expect(MSG).toMatch(new RegExp(`\\n  ${key}:\\s+'[^']+'`));
    expect(SRC).toMatch(new RegExp(`SUGGEST\\.${key}\\b`));
  });

  it('느낌표를 쓰지 않는다', () => {
    for (const key of keys) {
      const v = MSG.match(new RegExp(`\\n  ${key}:\\s+'([^']+)'`))?.[1] ?? '';
      expect(v).not.toMatch(/!/);
    }
  });

  it('예시 주소에 실제 사용자 주소를 쓰지 않는다', () => {
    const v = MSG.match(/\n  addressPlaceholder:\s+'([^']+)'/)?.[1] ?? '';
    expect(v).not.toMatch(/모곡리/);
  });
});
