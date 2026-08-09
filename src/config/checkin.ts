/**
 * 발도장 정책 — 위치 근접성 검증
 *
 * 정책:
 *   1. 사용자는 spot 좌표로부터 반경 N m 안에 있어야 발도장 가능
 *   2. 카테고리별 면적이 다르므로 override 허용
 *      - 공원/산책로/강변/해변: 면적 크므로 100~200m 허용
 *      - 쉼터/애견카페: 작은 시설이므로 20m strict
 *   3. GPS 정확도가 너무 낮으면(>100m) 차단 (위치 신뢰 불가)
 *   4. 정확도 마진: 거리 + (accuracy * 0.5) 까지 허용
 *
 * 변경 시: 이 파일 한 곳만 수정. paw-checkin.tsx에서 import해서 사용.
 * 서버 측 검증(Edge Function `paw-checkin`)에도 같은 정책을 미러링해야 함.
 */
import type { SpotCategory } from '@/types';

/** 카테고리별 허용 반경 (m). 미지정 카테고리는 DEFAULT_RADIUS_M 사용. */
const CATEGORY_RADIUS_M: Partial<Record<SpotCategory, number>> = {
  park:      100,  // 공원: 잔디·산책로 포함하면 100m 정도
  trail:     150,  // 산책로: 선형이라 여유 필요
  riverside: 200,  // 강변/하천: 한강공원 등 매우 김
  beach:     150,  // 해변: 면적 큼
  rest_spot:  20,  // 쉼터: 작음
  // 시설은 전부 점포 단위 — 건물 하나다. 넓게 잡으면 옆 가게에서도 찍힌다.
  pet_cafe:     20,
  vet:          20,
  pet_grooming: 20,
  pet_boarding: 20,
};

export const PAWMARK_PROXIMITY = {
  /** 카테고리 미지정 시 기본 반경 */
  DEFAULT_RADIUS_M: 20,
  /** GPS accuracy가 이보다 크면 신뢰 불가로 보고 차단 */
  MIN_ACCURACY_M: 100,
  /** 거리 허용 = 반경 + accuracy * ACCURACY_MARGIN_RATIO */
  ACCURACY_MARGIN_RATIO: 0.5,
} as const;

/** 동일 강아지 × 동일 spot에서 연속 발도장 최소 간격 (ms). 서버 검증과 미러. */
const PAWMARK_COOLDOWN_MS = 60 * 60 * 1000; // 1시간

/** last_visit_at으로부터 쿨다운까지 남은 시간 (ms). 0 이하면 가능. */
export function pawmarkCooldownRemainingMs(lastVisitAtIso?: string | null): number {
  if (!lastVisitAtIso) return 0;
  const last = new Date(lastVisitAtIso).getTime();
  if (Number.isNaN(last)) return 0;
  const elapsed = Date.now() - last;
  return Math.max(0, PAWMARK_COOLDOWN_MS - elapsed);
}

export function getPawmarkRadius(category?: SpotCategory): number {
  if (category && CATEGORY_RADIUS_M[category] != null) {
    return CATEGORY_RADIUS_M[category]!;
  }
  return PAWMARK_PROXIMITY.DEFAULT_RADIUS_M;
}
