/**
 * 강아지 프로필 바텀시트가 쓰는 표시값 계산.
 *
 * 규칙(2026-09-05 확정):
 *   1순위 — 본인이 직접 고른 태그가 있으면 그것을 쓴다.
 *   2순위 — 없으면 발도장 기록에서 계산한다.
 *
 * ⚠️ 2순위(산책 성향 폴백)는 **서버(spot-detail)가 계산한다.** 여기 있지 않다.
 *    카테고리·기분 분포는 그 강아지의 전체 발도장에 있고, 앱은 남의 발도장을
 *    볼 수 없다. 앱에서 만들면 지금 보고 있는 장소 하나만 보고 단정하게 된다.
 *
 * ⚠️ 폴백은 **산책 줄에만** 성립한다. 성격("낯가림 있어요")은 기록에서
 *    유추할 방법이 없다. 성격 태그가 없으면 그 줄은 그리지 않는다.
 */
import type { DogAgeGroup, DogSize } from '../types';

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
