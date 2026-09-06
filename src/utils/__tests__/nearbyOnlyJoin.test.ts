/**
 * "주변 장소만 도는 목록"이 내 기록을 삼키는 문제 — 세 번째 재발이라 규칙으로 못박는다.
 *
 * store.spots는 useNearbySpots가 채우는 **지금 내 주변**만 담고, persist에서도
 * 제외돼 앱을 껐다 켜면 빈 배열로 시작한다. 반면 visitSummaries·savedSpots는
 * persist된다. 그래서 "기록은 있는데 그 기록이 가리키는 장소가 없는" 상태가 흔하다.
 *
 * 실제로 세 화면에서 같은 원인으로 목록이 비었다.
 *   ① 강아지 상세      → useInteractedSpots를 만들어 해결
 *   ② 내 장소 탭       → 훅이 있는데 안 붙어 있었다
 *   ③ 홈(최근·자주)    → getHomeCards가 spots만 돌고 있었다
 *
 * 규칙: 내 기록을 그리는 목록은 **store.spots만 돌면 안 된다.**
 *       보충한 장소를 합쳐서 돌아야 한다.
 */

/** getHomeCards가 실제로 하는 합치기 — 순수 부분만 떼어냈다 */
export function mergeSpots<T extends { spot_id: string }>(nearby: T[], extra: T[]): T[] {
  if (extra.length === 0) return nearby;
  const byId = new Map(nearby.map(s => [s.spot_id, s]));
  for (const s of extra) if (!byId.has(s.spot_id)) byId.set(s.spot_id, s);
  return Array.from(byId.values());
}

const A = { spot_id: 'a' };
const B = { spot_id: 'b' };
const A2 = { spot_id: 'a', fresh: true };

describe('주변 장소 + 보충 장소 합치기', () => {
  it('보충이 없으면 원본 배열 그대로 — 불필요한 사본을 만들지 않는다', () => {
    const nearby = [A, B];
    expect(mergeSpots(nearby, [])).toBe(nearby);
  });

  // 이게 세 번 났던 사고다
  it('주변에 없는 기록 장소가 결과에 들어온다', () => {
    expect(mergeSpots([A], [B]).map(s => s.spot_id)).toEqual(['a', 'b']);
  });

  it('겹치면 주변 것을 남긴다 — 주변 데이터가 거리·집계까지 갖고 있어 더 완전하다', () => {
    const out = mergeSpots([A], [A2 as any]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(A);
  });

  it('주변이 비어 있어도 기록 장소로 목록을 만든다 — 앱 재시작 직후가 이 상태다', () => {
    expect(mergeSpots([], [A, B]).map(s => s.spot_id)).toEqual(['a', 'b']);
  });
});
