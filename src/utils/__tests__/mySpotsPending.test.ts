/**
 * 「내 장소」 로딩 상태 규칙 — 화면 로직을 그대로 옮긴 순수 함수로 검증한다.
 *
 * 왜 있나: 기록은 있는데 장소를 못 받은 상태를 "기록 없음"과 구분하려고 로딩을
 * 넣었는데, 조회가 끝났는지를 함께 보지 않아 **영구 로딩**이 될 수 있었다.
 * spots RLS는 status='active'만 읽게 해서, 어드민이 숨긴 장소는 영원히 안 온다.
 */
export function isPending(args: {
  spotsPending: boolean;   // 훅이 아직 물어볼 id가 남았다고 알려주는가
  recordCount: number;     // 내 기록 수
  resolvedCount: number;   // 그중 장소까지 붙은 수
}): boolean {
  return args.spotsPending && args.recordCount > 0 && args.resolvedCount === 0;
}

describe('내 장소 — 로딩과 빈 상태', () => {
  it('기록이 없으면 로딩이 아니다', () => {
    expect(isPending({ spotsPending: true, recordCount: 0, resolvedCount: 0 })).toBe(false);
  });

  it('기록이 있고 아직 조회 중이면 로딩이다', () => {
    expect(isPending({ spotsPending: true, recordCount: 3, resolvedCount: 0 })).toBe(true);
  });

  // 이 테스트가 실제 사고를 막는다
  it('조회가 끝났으면 못 받은 기록이 있어도 로딩이 아니다 — 숨긴 장소는 영원히 안 온다', () => {
    expect(isPending({ spotsPending: false, recordCount: 3, resolvedCount: 0 })).toBe(false);
  });

  it('하나라도 붙었으면 목록을 보여준다', () => {
    expect(isPending({ spotsPending: true, recordCount: 3, resolvedCount: 1 })).toBe(false);
  });
});
