/**
 * 설명 필터 회귀 테스트
 *
 * 실측(2026-08-07, active 5,317곳): 이 규칙을 통과하는 원천 데이터는 단 1곳이다.
 * 나머지는 전부 카테고리·시설의 기계적 재서술이라 화면에 올리면 정보 중복이 된다.
 */
import { authoredDescription } from '../spotDescription';

describe('authoredDescription', () => {
  it('공원구분을 그대로 반복한 설명은 버린다', () => {
    expect(authoredDescription('어린이공원', '어린이공원')).toBeUndefined();
    expect(authoredDescription('  소공원 ', '소공원')).toBeUndefined();
  });

  it('공원구분과 글자가 달라도 유형 한 단어면 버린다', () => {
    // "도시공원"은 subcategory가 '기타공원'인 행에도 315곳 붙어 있어 == 비교로는 못 걸렀다
    expect(authoredDescription('도시공원', '기타공원')).toBeUndefined();
    expect(authoredDescription('근린공원', null)).toBeUndefined();
    expect(authoredDescription('마을마당', null)).toBeUndefined();
  });

  it('시설을 나열한 자동 문장은 버린다 (같은 내용이 편의·주의 칩으로 나간다)', () => {
    expect(authoredDescription('조합놀이대, 배드민턴 등을 갖춘 어린이공원', '어린이공원')).toBeUndefined();
    expect(authoredDescription('농구장, 화장실 등을 갖춘 근린공원', '근린공원')).toBeUndefined();
  });

  it('사람이 쓴 설명은 통과시킨다', () => {
    // 원천 데이터 5,317곳 중 유일하게 살아남는 실제 값
    expect(authoredDescription('양재천 따라 길어요', '근린공원')).toBe('양재천 따라 길어요');
    // 사용자가 등록할 법한 문장들
    expect(authoredDescription('그늘이 많아요', null)).toBe('그늘이 많아요');
    expect(authoredDescription('바닥이 흙이라 발이 편해요', '소공원')).toBe('바닥이 흙이라 발이 편해요');
    expect(authoredDescription('밤에 조명이 밝은 공원이에요', '근린공원')).toBe('밤에 조명이 밝은 공원이에요');
  });

  it('빈 값은 undefined', () => {
    expect(authoredDescription(null, '공원')).toBeUndefined();
    expect(authoredDescription(undefined, null)).toBeUndefined();
    expect(authoredDescription('   ', null)).toBeUndefined();
  });
});
