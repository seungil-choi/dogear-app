/**
 * 장소 유형의 두 갈래 — 산책지 / 시설
 *
 * 발도장(체크인)은 양쪽 모두에서 찍는다. 갈리는 건 '추천해도 되는가'다.
 *   산책지: 가까우면 좋은 곳 → 오늘의 추천에 올린다.
 *   시설  : 필요할 때 찾는 곳 → 가깝다는 이유로 들이밀 이유가 없다.
 *           "오늘의 추천: OO동물병원"은 추천이 아니라 소음이다.
 *
 * 애견 카페는 시설이지만 추천 대상이다 — 볼일이 아니라 목적지라서.
 * 그래서 '시설이냐'와 '추천 대상이냐'를 하나로 묶지 않고 따로 둔다.
 */
import type { SpotCategory } from '../types';

/** 시설 — 영업하는 곳. 폐업·영업시간 같은 신선도 문제가 따라붙는다 */
export const FACILITY_CATEGORIES: readonly SpotCategory[] = [
  'pet_cafe', 'vet', 'pet_grooming', 'pet_boarding',
];

/**
 * '오늘의 추천'에서 뺄 유형.
 * 목적지가 아니라 볼일인 곳들 — 거리순으로 들이밀면 방해만 된다.
 */
const NOT_RECOMMENDABLE: readonly SpotCategory[] = ['vet', 'pet_grooming', 'pet_boarding'];

export function isRecommendableCategory(category: SpotCategory): boolean {
  return !NOT_RECOMMENDABLE.includes(category);
}
