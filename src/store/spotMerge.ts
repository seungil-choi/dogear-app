/**
 * 스팟 병합 규칙 — 스토어에서 분리한 순수 함수.
 *
 * 스토어 안에 있을 때는 AsyncStorage·supabase 의존 때문에 테스트가 어려웠고,
 * 실제로 이 규칙에서 회귀가 두 번 났다(subcategory 유실, 내 장소 evict).
 * 순수 함수로 빼서 테스트로 고정한다.
 */
import type { Spot } from '../types';

/**
 * 메모리에 유지할 스팟 최대 개수.
 * 지도 팬마다 최대 150개씩 병합되는데 상한이 없으면 계속 쌓여
 * 카드·마커 계산이 매번 전체를 훑게 되고 지도가 점점 느려진다.
 */
const MAX_CACHED_SPOTS = 600;

export interface MergeContext {
  /** 저장한 장소 id (evict 금지) */
  savedSpotIds: string[];
  /** 방문 기록이 있는 장소 id (evict 금지) */
  visitedSpotIds: string[];
  /** 현재 선택된 장소 id (evict 금지) */
  selectedSpotId?: string | null;
  /** 상한 — 테스트에서 낮춰 쓰기 위해 주입 가능 */
  max?: number;
}

/**
 * 기존 목록에 새 목록을 병합한다.
 *
 * 규칙:
 *  1. 필드 단위 병합 — 새 객체에 없는(undefined/null) 값이 기존 값을 지우지 않는다.
 *     지도 팬 페치처럼 일부 필드만 담아 오는 경로가 있어, 통째로 덮으면
 *     subcategory 같은 값이 사라져 목록 썸네일이 상세와 달라진다.
 *  2. 갱신된 항목은 "최근" 위치로 이동한다(오래된 것부터 버리기 위함).
 *  3. 상한 초과 시 오래된 것부터 버리되, 사용자가 관계를 맺은 장소
 *     (저장·방문·현재 선택)와 이번에 불러온 것은 절대 버리지 않는다.
 */
export function mergeSpotList(
  current: Spot[],
  incoming: Spot[],
  ctx: MergeContext,
): Spot[] {
  const max = ctx.max ?? MAX_CACHED_SPOTS;
  const byId = new Map(current.map(sp => [sp.spot_id, sp]));

  for (const sp of incoming) {
    const prev = byId.get(sp.spot_id);
    if (!prev) { byId.set(sp.spot_id, sp); continue; }
    const merged: Spot = { ...prev };
    for (const [k, v] of Object.entries(sp)) {
      if (v !== undefined && v !== null) (merged as any)[k] = v;
    }
    byId.delete(sp.spot_id);   // 삽입 순서를 "최근 갱신" 순으로 유지
    byId.set(sp.spot_id, merged);
  }

  let next = [...byId.values()];
  if (next.length <= max) return next;

  const protectedIds = new Set<string>();
  for (const id of ctx.savedSpotIds) protectedIds.add(id);
  for (const id of ctx.visitedSpotIds) protectedIds.add(id);
  if (ctx.selectedSpotId) protectedIds.add(ctx.selectedSpotId);
  for (const sp of incoming) protectedIds.add(sp.spot_id);

  const dropCount = next.length - max;
  const toDrop = new Set<string>();
  for (const sp of next) {
    if (toDrop.size >= dropCount) break;
    if (!protectedIds.has(sp.spot_id)) toDrop.add(sp.spot_id);
  }
  return toDrop.size > 0 ? next.filter(sp => !toDrop.has(sp.spot_id)) : next;
}
