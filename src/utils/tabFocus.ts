/**
 * 탭 화면이 포커스를 잃은 이유가 「다른 탭으로 옮긴 것」인지 판정한다.
 *
 * 왜 따로 판정하나 (2026-09-11):
 *   탭 화면은 두 경우에 포커스를 잃는다 —
 *     ① 다른 탭을 눌렀다          → 탭 네비게이터의 활성 탭이 바뀐다
 *     ② 위에 화면이 쌓였다(장소 상세, 발도장 모달 등) → 활성 탭은 그대로다
 *   탐색은 ①에서만 진행 중이던 선택을 지워야 한다. ②에서 지우면
 *   핀 → 「상세 보기」 → 뒤로 왔을 때 고른 카드가 사라진다.
 *
 * @param tabState 탭 네비게이터 state (`navigation.getState()` — 화면이 속한 네비게이터의 state)
 * @param self     이 화면의 탭 라우트 이름 (예: 'map')
 */
export function isTabSwitchAway(
  tabState: { index: number; routes: ReadonlyArray<{ name: string }> } | undefined,
  self: string,
): boolean {
  if (!tabState || !tabState.routes?.length) return false;
  const current = tabState.routes[tabState.index]?.name;
  return current != null && current !== self;
}
