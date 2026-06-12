/**
 * refreshBus — pull-to-refresh 전역 갱신 버스
 *
 * 데이터 페치 훅(useNearbySpots/useUserData)은 root DataProvider에 마운트되어 있어
 * 개별 화면에서 직접 refetch를 호출할 수 없다.
 * 훅이 자신의 refresh 함수를 여기 등록해두면, 화면의 RefreshControl이
 * refreshAll()로 한 번에 트리거한다.
 *
 * DEV_SEED 모드에서는 등록된 핸들러가 없으므로 즉시 resolve (시각 효과만).
 */

type RefreshFn = () => Promise<void> | void;

const handlers = new Set<RefreshFn>();

/** 갱신 핸들러 등록. cleanup 함수 반환 — effect cleanup에서 호출. */
export function registerRefreshHandler(fn: RefreshFn): () => void {
  handlers.add(fn);
  return () => {
    handlers.delete(fn);
  };
}

/** 등록된 모든 핸들러 실행. 개별 실패는 무시 (pull-to-refresh가 죽지 않도록). */
export async function refreshAll(): Promise<void> {
  await Promise.allSettled(Array.from(handlers, fn => Promise.resolve(fn())));
}
