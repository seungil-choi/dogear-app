/**
 * 공원구분(subcategory) → 대표 일러스트 매핑
 *
 * spots.subcategory(원본 공원구분 텍스트)를 키로, 번들된 오렌지 모노톤 일러스트를 반환한다.
 *  - 운영 무비용 원칙: 실사 이미지 없이도 유형을 즉시 인지 (CategoryThumb 폴백 상위 단계)
 *  - cover_image_url(실사진)이 있으면 그쪽이 우선 — 이 일러스트는 사진이 없을 때만 쓰인다.
 *  - 매칭 실패해도 category가 'park'면 기본 공원 일러스트로 폴백.
 *
 * 실측 기준(2026-07-24, active spots): 어린이공원 2,683 / 근린공원 1,099 / 소공원 730 /
 *   기타·기타공원·주제공원 337 / 문화공원 140 / 체육공원 93 / 수변공원 81 / 역사공원 50 /
 *   묘지공원 12 / 도시농업공원 2 / 마을마당 1.
 */
import type { ImageSourcePropType } from 'react-native';

const PARK_DEFAULT: ImageSourcePropType = require('../../assets/illustrations/park-default.png');

// 원본 공원구분 텍스트 → 일러스트
const BY_SUBCATEGORY: Record<string, ImageSourcePropType> = {
  '어린이공원': require('../../assets/illustrations/park-children.png'),
  '근린공원': require('../../assets/illustrations/park-neighborhood.png'),
  '소공원': require('../../assets/illustrations/park-small.png'),
  '마을마당': require('../../assets/illustrations/park-small.png'),
  '문화공원': require('../../assets/illustrations/park-culture.png'),
  '수변공원': require('../../assets/illustrations/park-waterside.png'),
  '체육공원': require('../../assets/illustrations/park-sports.png'),
  '역사공원': require('../../assets/illustrations/park-history.png'),
  '묘지공원': require('../../assets/illustrations/park-cemetery.png'),
  '도시농업공원': require('../../assets/illustrations/park-urbanfarm.png'),
  '가로공원': require('../../assets/illustrations/park-street.png'),
  // 뭉뚱그려지는 값들은 기본 공원 일러스트
  '기타': PARK_DEFAULT,
  '기타공원': PARK_DEFAULT,
  '주제공원': PARK_DEFAULT,
  '도시공원': PARK_DEFAULT,
};

/**
 * 커버 일러스트를 반환한다. 없으면 null → 호출부에서 카테고리 컬러 폴백 사용.
 * @param subcategory spots.subcategory (원본 공원구분 텍스트)
 * @param category    spot.category 또는 한국어 라벨('공원') — subcategory 매칭 실패 시 park 여부 판단용
 */
// 공원구분이 없는 카테고리(산책로·강변·쉼터)용 대표 일러스트.
//   이게 없으면 해당 스팟만 '카테고리 컬러 + 라인 아이콘'으로 떨어져
//   공원 일러스트와 뒤섞여 보인다(합정 메세나폴리스 광장·경의선 책거리 숲길 등).
const BY_CATEGORY: Record<string, ImageSourcePropType> = {
  park:       PARK_DEFAULT,
  '공원':      PARK_DEFAULT,
  trail:      require('../../assets/illustrations/park-street.png'),
  '산책로':    require('../../assets/illustrations/park-street.png'),
  riverside:  require('../../assets/illustrations/park-waterside.png'),
  '강변':      require('../../assets/illustrations/park-waterside.png'),
  rest_spot:  require('../../assets/illustrations/park-small.png'),
  '쉼터':      require('../../assets/illustrations/park-small.png'),
};

export function parkIllustration(
  subcategory?: string | null,
  category?: string | null,
): ImageSourcePropType | null {
  if (subcategory && BY_SUBCATEGORY[subcategory]) return BY_SUBCATEGORY[subcategory];
  if (category && BY_CATEGORY[category]) return BY_CATEGORY[category];
  // 그래도 못 찾으면 기본 일러스트 — 카드마다 다른 종류가 섞이지 않게 한다
  return PARK_DEFAULT;
}
