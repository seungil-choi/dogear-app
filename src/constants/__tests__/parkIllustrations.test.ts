/**
 * 커버 일러스트 매핑 회귀 테스트.
 *
 * 일러스트가 공원 전용이라 산책로·강변·쉼터 스팟만 색배경+아이콘으로 떨어져
 * 목록 썸네일이 뒤죽박죽으로 보였다(합정 메세나폴리스 광장, 경의선 책거리 숲길,
 * 망원한강공원 수변 산책로, 홍제천 합류부 수변공원 …).
 * "어떤 조합이 와도 반드시 일러스트가 나온다"를 고정한다.
 */
import { parkIllustration } from '../parkIllustrations';

// 실제 DB(status=active 5,317건)에 존재하는 category × subcategory 조합 전체
const REAL_COMBINATIONS: Array<[string, string | null, number]> = [
  ['park', '어린이공원', 2683],
  ['park', '근린공원', 1099],
  ['park', '소공원', 730],
  ['park', '기타', 306],
  ['park', '문화공원', 140],
  ['park', '체육공원', 93],
  ['park', '수변공원', 81],
  ['park', null, 56],
  ['park', '역사공원', 50],
  ['park', '기타공원', 29],
  ['park', '묘지공원', 12],
  ['park', '도시농업공원', 2],
  ['park', '주제공원', 2],
  ['park', '마을마당', 1],
  ['trail', null, 15],
  ['riverside', null, 14],
  ['rest_spot', null, 4],
];

describe('parkIllustration — 실 DB 조합 전수', () => {
  it.each(REAL_COMBINATIONS)('category=%s subcategory=%s (%i곳) 은 일러스트를 반환한다',
    (category, subcategory) => {
      expect(parkIllustration(subcategory, category)).toBeTruthy();
    });

  it('전체 5,317곳이 빠짐없이 커버된다', () => {
    const total = REAL_COMBINATIONS.reduce((sum, [, , c]) => sum + c, 0);
    expect(total).toBe(5317);
    const covered = REAL_COMBINATIONS
      .filter(([cat, sub]) => Boolean(parkIllustration(sub, cat)))
      .reduce((sum, [, , c]) => sum + c, 0);
    expect(covered).toBe(total);
  });
});

describe('parkIllustration — 폴백 보장', () => {
  it('공원구분이 매칭되면 그 일러스트를 쓴다', () => {
    expect(parkIllustration('어린이공원', 'park'))
      .not.toBe(parkIllustration('수변공원', 'park'));
  });

  it('한국어 카테고리 라벨로도 동작한다(카드는 라벨을 넘긴다)', () => {
    expect(parkIllustration(null, '산책로')).toBeTruthy();
    expect(parkIllustration(null, '강변')).toBeTruthy();
    expect(parkIllustration(null, '쉼터')).toBeTruthy();
  });

  it('알 수 없는 값이 와도 null을 반환하지 않는다', () => {
    expect(parkIllustration(null, null)).toBeTruthy();
    expect(parkIllustration(undefined, undefined)).toBeTruthy();
    expect(parkIllustration('없는구분', '없는카테고리')).toBeTruthy();
  });
});
