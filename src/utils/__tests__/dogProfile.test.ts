import { factsLine, walkingFallback, WALKING_FALLBACK_MIN_PAWS } from '../dogProfile';

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

describe('walkingFallback — 태그가 없을 때만 쓰는 계산값', () => {
  const many = {
    categoryCounts: { 공원: 8, 산책로: 2 },
    feelingCounts: { quiet: 5, good: 9 },
    totalPaws: 10,
  };

  it('발도장이 적으면 아무 말도 하지 않는다', () => {
    expect(walkingFallback({ ...many, totalPaws: WALKING_FALLBACK_MIN_PAWS - 1 })).toEqual([]);
  });

  it('가장 많이 간 유형과 기분을 문장으로 만든다', () => {
    expect(walkingFallback(many)).toEqual(['공원을(를) 가장 많이 다녀요', '조용한 곳을 좋아해요']);
  });

  // 'good'이 최다여도 문장이 되면 안 된다 — 뜻이 넓어 성향이 아니다
  it("'good'은 성향 문장으로 만들지 않는다", () => {
    const r = walkingFallback({ ...many, feelingCounts: { good: 9 } });
    expect(r).toEqual(['공원을(를) 가장 많이 다녀요']);
  });

  it("'noisy'도 제외한다 — 그 아이가 아니라 장소에 대한 불평이다", () => {
    const r = walkingFallback({ ...many, feelingCounts: { noisy: 7 } });
    expect(r).toEqual(['공원을(를) 가장 많이 다녀요']);
  });

  it('최대 2줄 — 폴백이 본체보다 커지면 안 된다', () => {
    const r = walkingFallback({
      categoryCounts: { 공원: 5, 해변: 3 },
      feelingCounts: { quiet: 4, many_dogs: 3, come_back_again: 2 },
      totalPaws: 12,
    });
    expect(r.length).toBeLessThanOrEqual(2);
  });
});
