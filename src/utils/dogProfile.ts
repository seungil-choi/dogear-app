/**
 * 강아지 프로필 바텀시트가 쓰는 표시값 계산.
 *
 * 규칙(2026-09-05 확정):
 *   1순위 — 본인이 직접 고른 태그가 있으면 그것을 쓴다.
 *   2순위 — 없으면 발도장 기록에서 계산한다.
 *
 * ⚠️ 폴백은 **산책 줄에만** 성립한다. 성격("낯가림 있어요")은 발도장 기록에서
 *    유추할 방법이 없다. 성격 태그가 없으면 그 줄은 그리지 않는다.
 *
 * ⚠️ 이 시트는 **남이 보는 화면**이다. "어떤 아이인가"만 계산하고
 *    "어디에 있었나"는 만들지 않는다 — 발도장은 위치 기록이라 장소·시각이 곧 동선이다.
 */
import type { DogAgeGroup, DogSize } from '../types';

/** 계산을 시작하는 최소 발도장 수. 한두 번 간 곳을 성향이라 부르지 않는다. */
export const WALKING_FALLBACK_MIN_PAWS = 5;

const AGE_LABEL: Record<DogAgeGroup, string> = {
  puppy: '어린 개', adult: '성견', senior: '노령견',
};
const SIZE_LABEL: Record<DogSize, string> = {
  small: '소형견', medium: '중형견', large: '대형견',
};

/**
 * 이름 아래 한 줄. 있는 값만 가운뎃점으로 잇는다.
 * 나이는 정확한 살 수를 모르므로 age_group 라벨을 쓴다.
 */
export function factsLine(d: {
  breed?: string | null; age_group?: DogAgeGroup | null;
  weight_kg?: number | null; size?: DogSize | null;
}): string {
  const parts: string[] = [];
  if (d.breed) parts.push(d.breed);
  if (d.age_group && AGE_LABEL[d.age_group]) parts.push(AGE_LABEL[d.age_group]);
  // 소수 첫째 자리까지. 5.0kg을 '5kg'로 보여야 자연스럽다.
  if (typeof d.weight_kg === 'number' && d.weight_kg > 0) {
    parts.push(`${Number(d.weight_kg.toFixed(1))}kg`);
  }
  if (d.size && SIZE_LABEL[d.size]) parts.push(SIZE_LABEL[d.size]);
  return parts.join(' · ');
}

/** 발도장 기록에서 뽑을 수 있는 재료 */
export interface WalkingEvidence {
  /** 카테고리 라벨 → 횟수 (예: { 공원: 8, 산책로: 2 }) */
  categoryCounts: Record<string, number>;
  /** 기분 태그 → 횟수 (feeling_tag enum) */
  feelingCounts: Record<string, number>;
  /** 전체 누적 발도장 수 */
  totalPaws: number;
}

const FEELING_SENTENCE: Record<string, string> = {
  quiet:              '조용한 곳을 좋아해요',
  many_dogs:          '강아지가 많은 곳을 좋아해요',
  good_for_short_rest:'잠깐 쉬어가기 좋은 곳을 자주 찾아요',
  come_back_again:    '한 번 간 곳을 다시 찾는 편이에요',
};

/**
 * 산책 성향 폴백 — **최대 2줄**.
 * 더 늘리면 폴백이 본체(성격 태그)보다 커져 주객이 바뀐다.
 */
export function walkingFallback(ev: WalkingEvidence): string[] {
  if (ev.totalPaws < WALKING_FALLBACK_MIN_PAWS) return [];
  const out: string[] = [];

  const topCategory = Object.entries(ev.categoryCounts)
    .sort((a, b) => b[1] - a[1])[0];
  if (topCategory && topCategory[1] > 0) {
    out.push(`${topCategory[0]}을(를) 가장 많이 다녀요`);
  }

  // 'good'·'noisy'는 문장으로 만들지 않는다. 'good'은 뜻이 넓어 성향이 아니고,
  // 'noisy'는 그 아이가 아니라 장소에 대한 불평이라 프로필에 올릴 말이 아니다.
  const topFeeling = Object.entries(ev.feelingCounts)
    .filter(([k]) => FEELING_SENTENCE[k])
    .sort((a, b) => b[1] - a[1])[0];
  if (topFeeling && topFeeling[1] > 0) out.push(FEELING_SENTENCE[topFeeling[0]]);

  return out.slice(0, 2);
}
