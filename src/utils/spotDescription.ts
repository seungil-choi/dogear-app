/**
 * 장소 설명이 "사람이 쓴 것"인지 판별한다.
 *
 * 왜 필요한가 (실측 2026-08-07, active 5,317곳):
 *   원천 데이터의 description은 거의 전부 기계 생성물이다.
 *     - subcategory를 그대로 반복       … "어린이공원", "소공원", "도시공원" 등 3,057곳
 *     - tags를 문장으로 늘어놓은 것       … "조합놀이대, 배드민턴 등을 갖춘 어린이공원" 2,171곳
 *     - 사람이 쓴 것                      … "양재천 따라 길어요" **1곳**
 *
 *   앞의 두 부류는 화면에 이미 있는 정보의 반복이다.
 *   카테고리는 이름 옆에 붙고, 시설은 편의·주의 칩으로 렌더된다.
 *   그걸 설명란에 또 적으면 정보가 늘어나는 게 아니라 잡음만 늘어난다.
 *
 * 그래서 이 함수는 "기계가 만든 문장"을 걸러내고, 사람이 쓴 것만 통과시킨다.
 * 사용자가 직접 등록한 장소의 설명은 어떤 패턴에도 걸리지 않으므로 그대로 보인다.
 */

/** 공원 유형 한 단어짜리 설명 — "도시공원", "마을마당" 등 */
const BARE_TYPE_WORD = /^[가-힣]{2,8}(공원|마당|녹지|광장)$/;

/** 시설 나열 자동 문장 — "A, B 등을 갖춘 C" */
const GENERATED_FACILITY_SENTENCE = '등을 갖춘';

export function authoredDescription(
  description?: string | null,
  subcategory?: string | null,
): string | undefined {
  const d = (description ?? '').trim();
  if (!d) return undefined;
  // 1) 공원구분을 그대로 되풀이
  if (d === (subcategory ?? '').trim()) return undefined;
  // 2) 유형 한 단어 (subcategory와 글자가 달라도 정보가 없다 — "도시공원" 315곳)
  if (BARE_TYPE_WORD.test(d)) return undefined;
  // 3) 시설 나열 자동 문장 — 같은 내용이 편의·주의 칩으로 이미 나간다
  if (d.includes(GENERATED_FACILITY_SENTENCE)) return undefined;
  return d;
}
