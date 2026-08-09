import { displaySavedCount } from '../rules';

describe('displaySavedCount', () => {
  it('서버와 로컬이 같으면 서버 값을 그대로 쓴다', () => {
    expect(displaySavedCount(12, true, true)).toBe(12);
    expect(displaySavedCount(12, false, false)).toBe(12);
  });

  it('방금 저장했으면 +1 — 이게 없으면 눌러도 숫자가 멈춰 있다', () => {
    expect(displaySavedCount(12, false, true)).toBe(13);
  });

  it('방금 저장을 풀었으면 -1', () => {
    expect(displaySavedCount(12, true, false)).toBe(11);
  });

  it('아무도 저장 안 한 장소를 처음 저장하면 0 → 1', () => {
    expect(displaySavedCount(0, false, true)).toBe(1);
  });

  it('음수로 내려가지 않는다 (서버 집계가 아직 0인데 해제한 경우)', () => {
    expect(displaySavedCount(0, true, false)).toBe(0);
  });
});
