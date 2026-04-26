import type {
  DogSize, DogAgeGroup, SpotCategory, VisibilityLevel,
  RegularStatus, AtmosphereState, FeelingTag, SavedType,
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
  pet_cafe: '애견 카페',
  beach: '해변',
};

// ─── 공개 범위 라벨 ─────────────────────────────
export const visibilityLabel: Record<VisibilityLevel, string> = {
  private: '나만 보기',
  spot_only: '장소 분위기 반영',
  familiar_layer: '산책 친구 찾기',
};

export const visibilityDescription: Record<VisibilityLevel, string> = {
  private: '기록은 저장되지만 다른 곳에는 반영되지 않아요',
  spot_only: '장소 분위기 집계에만 반영되고, 우리 아이 정보는 보이지 않아요',
  familiar_layer: '안전 조건을 충족한 경우에만 자주 만나는 강아지에게 최소한의 정보로 소개돼요',
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

// ─── 저장 타입 라벨 ─────────────────────────────
export const savedTypeLabel: Record<SavedType, string> = {
  want_to_go: '가보고 싶어요',
  go_again: '다시 가고 싶어요',
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

// ─── 거리 텍스트 (mock) ─────────────────────────────
export function distanceText(meters: number): string {
  if (meters < 100) return '바로 근처예요';
  if (meters < 500) return `${Math.round(meters / 10) * 10}m`;
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters / 100) * 100}m`;
  return `${km.toFixed(1)}km`;
}
