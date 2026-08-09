import type {
  DogSize, DogAgeGroup, SpotCategory, VisibilityLevel,
  RegularStatus, AtmosphereState, FeelingTag,
} from '../types';

// ─── 강아지 라벨 ─────────────────────────────
export const sizeLabel: Record<DogSize, string> = {
  small: '소형견',
  medium: '중형견',
  large: '대형견',
};

export const ageGroupLabel: Record<DogAgeGroup, string> = {
  puppy: '퍼피',
  adult: '성견',
  senior: '노령견',
};

export const temperamentLabels: Record<string, string> = {
  active: '활발한 편',
  shy: '낯가림 있어요',
  quiet: '조용한 편',
  sensitive: '예민한 편',
  friendly: '친화적이에요',
};

export const walkingStyleLabels: Record<string, string> = {
  short_walks: '짧고 자주 산책해요',
  long_walks: '오래 걷는 편이에요',
  sniffing: '냄새 맡기 좋아해요',
  frequent_walks: '자주 나가는 편이에요',
  slow_pace: '천천히 걷는 편이에요',
};

// ─── 장소 라벨 ─────────────────────────────
export const categoryLabel: Record<SpotCategory, string> = {
  park: '공원',
  trail: '산책로',
  riverside: '하천/강변',
  rest_spot: '쉼터',
  beach: '해변',
  pet_cafe: '애견 카페',
  vet: '동물병원',
  pet_grooming: '애견 미용',
  pet_boarding: '애견 호텔·유치원',
  other: '기타',
};

// ─── 공개 범위 라벨 (SSOT) ─────────────────────────────
// ⚠️ 이 파일이 visibility 라벨의 단일 진실 공급원(Single Source of Truth)입니다.
//   - 다른 화면(StatusBadge / paw-checkin / privacy-settings / visit-history 등)
//     에서는 반드시 이 객체를 import해서 사용하세요. 하드코딩 금지.
//   - 통일된 표현: "장소 분위기에만" (체크인 단계에서 사용자가 보는 자연어)
export const visibilityLabel: Record<VisibilityLevel, string> = {
  private: '나만 보기',
  spot_only: '장소 분위기에만',
  familiar_layer: '산책 친구 찾기',
};

// ─── 단골 상태 라벨 ─────────────────────────────
export const regularStatusLabel: Record<RegularStatus, string> = {
  none: '',
  candidate: '자주 찾는 스팟이 되어가고 있어요',
  regular: '우리 아이의 단골 스팟이에요',
};

// ─── 분위기 라벨 ─────────────────────────────
export const atmosphereLabel: Record<AtmosphereState, string> = {
  quiet: '최근 조용한 편이에요',
  active: '최근 강아지들이 자주 다녀갔어요',
  mixed: '최근 분위기가 섞여 있어요',
  unknown: '최근 흔적이 아직 없어요',
};

// ─── 느낌 태그 라벨 ─────────────────────────────
export const feelingTagLabel: Record<FeelingTag, string> = {
  quiet: '한적해요',
  good: '좋았어요',
  many_dogs: '강아지 많아요',
  come_back_again: '다시 오고 싶어요',
  noisy: '조금 시끄러워요',
  good_for_short_rest: '잠깐 쉬기 좋아요',
};

// ─── 상대 시간 ─────────────────────────────
export function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(isoString).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// ─── 방문 날짜 텍스트 ─────────────────────────────
export function visitDateText(isoString: string): string {
  const d = new Date(isoString);
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// ─── 거리 텍스트 ─────────────────────────────
/**
 * 미터 → 화면에 쓸 거리 문자열. **앱 전체가 이 함수 하나만 쓴다.**
 *
 * 왜 한 곳으로 모았나:
 *   홈 카드·장소 상세(서버)·장소 상세(로컬)·탐색 패널이 각자 다르게 포맷하고 있었다.
 *   같은 740m가 화면에 따라 `740m` / `700m`로, 80m가 `80m` / `바로 근처` / `바로 근처예요`로
 *   달리 나왔다. 사용자에겐 그냥 "거리가 안 맞는" 것으로 보인다.
 *
 * 눈금을 거리에 따라 굵게 잡는 이유:
 *   휴대폰 GPS 오차가 수십 m다. 멀수록 10m 단위로 적으면 없는 정밀도를 있는 척하게 된다.
 *     100m 미만  → 숫자 대신 말로 (오차가 값을 압도하는 구간)
 *     500m 미만  → 10m 단위
 *     1km 미만   → 100m 단위
 *     1km 이상   → 0.1km 단위
 */
export function distanceText(meters: number): string {
  if (meters < 100) return '바로 근처예요';
  if (meters < 500) return `${Math.round(meters / 10) * 10}m`;
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters / 100) * 100}m`;
  return `${km.toFixed(1)}km`;
}

/**
 * 거리를 모를 수도 있는 자리용(위치 권한 거부 등).
 * @param fallback 거리를 모를 때 보여줄 문구. 화면 성격에 따라 다르다
 *   (목록 카드는 '근처', 상세는 '거리 정보 없음').
 */
export function distanceTextOr(meters: number | null | undefined, fallback: string): string {
  return meters == null ? fallback : distanceText(meters);
}
