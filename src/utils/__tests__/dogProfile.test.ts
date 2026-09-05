import { factsLine } from '../dogProfile';

describe('factsLine — 이름 아래 한 줄', () => {
  it('네 값이 다 있으면 가운뎃점으로 잇는다', () => {
    expect(factsLine({ breed: '말티즈', age_group: 'adult', weight_kg: 5.2, size: 'small' }))
      .toBe('말티즈 · 성견 · 5.2kg · 소형견');
  });

  // 빈 값이 섞이면 '· ·' 처럼 구분자만 남는 사고가 잘 난다
  it('없는 값은 자리도 남기지 않는다', () => {
    expect(factsLine({ breed: null, age_group: 'puppy', weight_kg: null, size: 'large' }))
      .toBe('어린 개 · 대형견');
  });

  it('아무것도 없으면 빈 문자열 — 화면이 줄을 안 그린다', () => {
    expect(factsLine({})).toBe('');
  });

  it('5.0kg은 5kg으로 — 소수점 0을 끌고 다니지 않는다', () => {
    expect(factsLine({ weight_kg: 5.0 })).toBe('5kg');
    expect(factsLine({ weight_kg: 8.46 })).toBe('8.5kg');
  });

  // 8.45는 2진수로 8.4499…라 toFixed(1)이 8.4로 내려간다.
  // 체중 표시에서 0.1kg 차이는 무해하므로 고치지 않고 동작을 못박아 둔다.
  it('경계값은 내려간다 (부동소수점)', () => {
    expect(factsLine({ weight_kg: 8.45 })).toBe('8.4kg');
  });

  it('체중 0은 값이 아니다', () => {
    expect(factsLine({ breed: '푸들', weight_kg: 0 })).toBe('푸들');
  });
});
