/**
 * 지리 유틸 — Haversine 거리 계산 + 발도장 근접성 검증
 */
import { PAWMARK_PROXIMITY, getPawmarkRadius } from '../config/checkin';
import type { SpotCategory } from '../types';

/** 두 좌표 간 거리 (미터). 지구 반지름 6371km 기준. */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ProximityFailure =
  | { ok: false; reason: 'no_location'; distance: null; allowed: null }
  | { ok: false; reason: 'low_accuracy'; distance: null; allowed: null; accuracy: number }
  | { ok: false; reason: 'invalid_spot'; distance: null; allowed: null }
  | { ok: false; reason: 'too_far'; distance: number; allowed: number; accuracy: number | null };

export type ProximityResult =
  | { ok: true; distance: number; allowed: number; accuracy: number | null }
  | ProximityFailure;

/**
 * spot 좌표가 의미 있는 값인지 검증.
 *   - lat/lng가 0 근처 (절대값 < 0.01) → null island / 미입력
 *   - 위경도 범위 벗어남 → 잘못된 데이터
 */
function isValidSpotCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

interface CheckArgs {
  currentLocation: { latitude: number; longitude: number; accuracy?: number } | null;
  spot: { latitude: number; longitude: number; category?: SpotCategory };
}

/**
 * 발도장 가능 여부 판정.
 * - currentLocation 없음 → no_location
 * - accuracy > MIN_ACCURACY_M → low_accuracy
 * - 거리 > (radius + accuracy*margin) → too_far
 * - 그 외 → ok
 */
export function checkPawmarkProximity({ currentLocation, spot }: CheckArgs): ProximityResult {
  // spot 좌표 무결성 먼저 검증 (DB 누락/null island 방지)
  if (!isValidSpotCoord(spot.latitude, spot.longitude)) {
    return { ok: false, reason: 'invalid_spot', distance: null, allowed: null };
  }

  if (!currentLocation) {
    return { ok: false, reason: 'no_location', distance: null, allowed: null };
  }

  const accuracy = currentLocation.accuracy ?? null;

  if (accuracy != null && accuracy > PAWMARK_PROXIMITY.MIN_ACCURACY_M) {
    return { ok: false, reason: 'low_accuracy', distance: null, allowed: null, accuracy };
  }

  const distance = haversineDistance(
    currentLocation.latitude,
    currentLocation.longitude,
    spot.latitude,
    spot.longitude,
  );

  const baseRadius = getPawmarkRadius(spot.category);
  // 마진에 상한을 둔다 — 없으면 정확도가 나쁠수록 허용 반경이 함께 커져서
  // 정확도 50m일 때 공원 반경이 60 → 85m가 됐다(서버와 같은 규칙).
  const margin = accuracy != null
    ? Math.min(
        accuracy * PAWMARK_PROXIMITY.ACCURACY_MARGIN_RATIO,
        PAWMARK_PROXIMITY.MAX_ACCURACY_MARGIN_M,
      )
    : 0;
  const allowed = baseRadius + margin;

  if (distance > allowed) {
    return { ok: false, reason: 'too_far', distance, allowed, accuracy };
  }
  return { ok: true, distance, allowed, accuracy };
}

/**
 * 발도장 근접 안내 전용 거리 텍스트 ("약 15m 떨어져 있어요").
 *
 * ⚠️ `labels.ts`의 `distanceText`와 **일부러 다르다. 합치지 말 것.**
 *   distanceText는 100m 미만을 "바로 근처예요"로 뭉갠다 — 목록에서는 그게 맞지만,
 *   여기는 반경 약 20m 이내인지를 알려주는 자리라 그렇게 뭉개면 안내가 무의미해진다.
 *   ("바로 근처예요"인데 발도장이 안 찍히는 상황이 된다)
 */
export function formatDistanceShort(meters: number): string {
  if (meters < 10) return `${Math.round(meters)}m`;
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
