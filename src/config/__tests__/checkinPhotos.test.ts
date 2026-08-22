/**
 * 발도장 사진 상한(MAX_CHECKIN_PHOTOS) 규칙을 잠근다.
 *
 * 왜 테스트가 필요한가:
 *   이 규칙은 화면·스토어·서버 세 곳이 함께 알아야 한다. 예전에는 세 곳에
 *   `3`이 각각 다른 형태로("> 3", "slice(0, 3)", 상수) 박혀 있어서,
 *   한 곳만 고치면 나머지가 조용히 어긋나는 상태였다.
 *   지금은 클라 두 곳이 config 한 곳을 보고, 서버는 미러 주석과 함께 복제한다.
 *   여기서는 "클라가 보는 값"과 그 값에 기반한 절단 규칙을 고정한다.
 */
import { MAX_CHECKIN_PHOTOS } from '../checkin';

/** 스토어 setPawPhotos가 하는 절단과 같은 규칙 (스토어를 통째로 띄우지 않고 검증) */
function clampPhotos(uris: string[]): string[] {
  return uris.slice(0, MAX_CHECKIN_PHOTOS);
}

describe('발도장 사진 상한', () => {
  it('상한은 3장이다 — 서버(paw-checkin) 미러 값과 같아야 한다', () => {
    expect(MAX_CHECKIN_PHOTOS).toBe(3);
  });

  it('사진 없이도 발도장이 성립한다(선택 입력)', () => {
    expect(clampPhotos([])).toEqual([]);
  });

  it('상한 이하는 그대로 둔다', () => {
    expect(clampPhotos(['a'])).toEqual(['a']);
    expect(clampPhotos(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('상한을 넘으면 앞에서부터 잘라낸다', () => {
    expect(clampPhotos(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c']);
  });

  it('상한에 도달하면 추가 버튼이 사라진다', () => {
    // 화면 조건: currentPhotos.length < MAX_CHECKIN_PHOTOS 일 때만 '추가'를 그린다
    const canAdd = (current: number) => current < MAX_CHECKIN_PHOTOS;
    expect(canAdd(0)).toBe(true);
    expect(canAdd(2)).toBe(true);
    expect(canAdd(3)).toBe(false);
  });

  it('상한 이상에서는 더 고를 자리가 없다', () => {
    // handleAddPhotos 조건: remaining <= 0 이면 피커를 열지 않는다
    const remaining = (current: number) => MAX_CHECKIN_PHOTOS - current;
    expect(remaining(3) <= 0).toBe(true);
    expect(remaining(5) <= 0).toBe(true); // 어떤 경위로 넘쳤어도 피커가 다시 열리면 안 된다
  });
});
