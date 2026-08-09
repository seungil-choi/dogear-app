import { distanceText, distanceTextOr } from '../labels';

/**
 * 거리 표기가 화면마다 갈라졌던 적이 있어(홈·상세×2·탐색 총 4벌) 규칙을 여기서 잠근다.
 * 같은 미터 값은 어느 화면에서도 같은 문자열이어야 한다.
 */
describe('distanceText — 눈금', () => {
  it('100m 미만은 숫자 대신 말로 (GPS 오차가 값을 압도하는 구간)', () => {
    expect(distanceText(0)).toBe('바로 근처예요');
    expect(distanceText(99)).toBe('바로 근처예요');
  });

  it('100~500m는 10m 단위', () => {
    expect(distanceText(100)).toBe('100m');
    expect(distanceText(347)).toBe('350m');
    expect(distanceText(499)).toBe('500m');
  });

  it('500m~1km는 100m 단위', () => {
    // 예전에 상세는 740m, 탐색은 700m로 갈렸던 구간
    expect(distanceText(740)).toBe('700m');
    expect(distanceText(500)).toBe('500m');
    expect(distanceText(950)).toBe('1000m');
  });

  it('1km 이상은 0.1km 단위', () => {
    expect(distanceText(1000)).toBe('1.0km');
    expect(distanceText(1500)).toBe('1.5km');
    expect(distanceText(12345)).toBe('12.3km');
  });

  it('눈금이 거리에 따라 굵어진다 — 멀수록 정밀도를 낮춘다', () => {
    // 없는 정밀도를 있는 척하지 않는다는 규칙이 지켜지는지
    expect(distanceText(1234)).not.toContain('1234');
    expect(distanceText(743)).not.toContain('743');
  });
});

describe('distanceTextOr — 거리를 모를 때', () => {
  it('null·undefined면 화면이 정한 문구', () => {
    expect(distanceTextOr(null, '근처')).toBe('근처');
    expect(distanceTextOr(undefined, '거리 정보 없음')).toBe('거리 정보 없음');
  });

  it('값이 있으면 distanceText와 완전히 같다', () => {
    for (const m of [0, 99, 100, 347, 500, 740, 999, 1000, 5432]) {
      expect(distanceTextOr(m, '근처')).toBe(distanceText(m));
    }
  });

  it('0m는 폴백이 아니다 (0은 유효한 거리다)', () => {
    // `meters == null` 이 아니라 falsy 검사로 짰다면 여기서 걸린다
    expect(distanceTextOr(0, '근처')).toBe('바로 근처예요');
  });
});
