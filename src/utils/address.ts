/**
 * 좌표 → 한국 주소 문자열.
 *
 * 왜 필요한가:
 *   사용자가 제안한 장소는 지도에 핀만 찍게 하고 좌표만 저장해왔다. 그래서
 *   `spots.address_text`가 항상 null이었고(실측: user_suggested 4건 전부 null),
 *   장소 상세의 '주소' 줄과 지도앱 열기·주소 복사가 통째로 사라졌다.
 *   공공데이터로 넣은 장소(22,651건)는 주소가 다 있어서 "어떤 곳은 주소가 없다"로 보인다.
 *
 * 플랫폼 차이:
 *   `formattedAddress`는 **안드로이드 전용**이다(expo-location 타입 주석). iOS는 항상
 *   null이므로 조각(region/city/district/…)을 직접 이어붙여야 한다. 안드로이드에서도
 *   Geocoder가 조각만 주는 경우가 있어 두 경로를 모두 둔다.
 */

/** expo-location `LocationGeocodedAddress`에서 이 모듈이 쓰는 부분만. */
export interface GeocodedParts {
  formattedAddress?: string | null;
  region?: string | null;
  city?: string | null;
  subregion?: string | null;
  district?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  country?: string | null;
}

/**
 * 주소 조각을 한국식 순서(광역 → 기초 → 동 → 도로 → 번호)로 잇는다.
 *
 * 조각이 겹치는 걸 걷어내는 게 핵심이다. 한국 주소에서 안드로이드 Geocoder는
 * region과 city에 똑같이 "서울특별시"를 넣어주는 일이 잦아 그대로 이으면
 * "서울특별시 서울특별시 마포구"가 된다.
 */
export function joinAddressParts(a: GeocodedParts): string {
  const ordered = [a.region, a.city, a.subregion, a.district, a.street, a.streetNumber];
  const out: string[] = [];
  for (const raw of ordered) {
    const part = (raw ?? '').trim();
    if (!part) continue;
    // 이미 넣은 조각과 같거나, 이미 넣은 조각에 포함되는 값은 버린다.
    //   ("서울특별시" 뒤의 "서울특별시", "마포구" 뒤의 "마포" 같은 경우)
    if (out.some(prev => prev === part || prev.includes(part))) continue;
    out.push(part);
  }
  return out.join(' ');
}

/**
 * 역지오코딩 결과 → 저장할 주소 문자열. 만들 수 없으면 빈 문자열.
 *
 * `formattedAddress`를 먼저 쓴다 — 플랫폼이 만든 완성형이 조각 조합보다 정확하다.
 * 다만 "대한민국 "이 앞에 붙어 오므로 떼어낸다. 공공데이터로 들어온 주소
 * (예: "강원특별자치도 강릉시 가작로")와 형식을 맞춰야 상세 화면에서 섞이지 않는다.
 */
export function formatKoreanAddress(a: GeocodedParts): string {
  const full = (a.formattedAddress ?? '').trim();
  if (full) {
    // `$` 분기가 필요하다 — 구분자를 요구하면 국가명만 온 "대한민국"이 그대로 주소가 된다.
    const withoutCountry = full.replace(/^(대한민국|South Korea)(?:[,\s]+|$)/, '').trim();
    if (withoutCountry) return withoutCountry;
  }
  return joinAddressParts(a);
}

/**
 * 주소에서 기초자치단체(구·군)를 뽑는다. `spots.neighborhood`와 같은 단위다
 * (기존 데이터 실측: "강남구").
 *
 * 조각(district/subregion)을 쓰지 않고 문자열에서 뽑는 이유:
 *   같은 "구"가 iOS에서는 city, 안드로이드에서는 subregion이나 district로 들어와
 *   어느 필드가 구인지 플랫폼별로 다르다. 완성된 주소에서 찾는 편이 안정적이다.
 *
 * `(\s|$)` 경계가 필요하다 — 없으면 "대구광역시"에서 "대구"를 집어낸다.
 */
export function extractNeighborhood(address: string): string | null {
  const m = address.match(/([가-힣]{1,10}[구군])(?=\s|$)/);
  return m ? m[1] : null;
}

/**
 * 시·도 이름을 표기용으로 줄인다.
 *
 * 왜 표를 두는가 (2026-09-13):
 *   예전엔 `sidoRaw.replace(/특별시|광역시|도$/, '')` 한 줄로 처리했다. 서울·경기만
 *   맞고 나머지는 조용히 깨졌다 — 실측으로 **6,082곳(전체의 27%)**이 이렇게 나왔다:
 *
 *     강원특별자치도 → "강원특별자치"      (591곳)
 *     전북특별자치도 → "전북특별자치"      (554곳)
 *     제주특별자치도 → "제주특별자치"      (293곳)
 *     경상남도       → "경상남"            (1,136곳, 관례는 경남)
 *     세종특별자치시 → 그대로 + 둘째 토큰이 도로명이라 "세종특별자치시 한누리대로"
 *
 *   접미사를 깎는 방식은 이름이 바뀔 때마다 새로 깨진다. 이름은 실제로 바뀐다 —
 *   강원(2023-06)·전북(2024-01)이 특별자치도가 됐고, **전남광주통합특별시**가
 *   2026-07-01 출범했다(전남 22시군 + 광주 5구, 특별법상 약칭 「광주특별시」).
 *   그래서 표로 못 박고, 표에 없으면 **깎지 않고 원문을 그대로 쓴다.**
 *   낯선 이름이 길게 나오는 건 눈에 띄어 고칠 수 있지만, 잘못 깎인 이름은
 *   그럴듯해 보여서 아무도 신고하지 않는다.
 */
const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  대전광역시: '대전',
  울산광역시: '울산',
  광주광역시: '광주',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주도: '제주',
  제주특별자치도: '제주',
  // 2026-07-01 출범. 전라남도·광주광역시를 폐지하고 합친 광역단체.
  전남광주통합특별시: '광주',
};

/** 시·도 표기 축약. 모르는 이름은 깎지 않고 그대로 돌려준다. */
export function shortSido(sido: string | null | undefined): string {
  const raw = (sido ?? '').trim();
  return SIDO_SHORT[raw] ?? raw;
}

/**
 * 「서울 마포구」 같은 한 줄 지역 표기.
 *
 * 시군구가 없으면(세종시처럼 시군구를 두지 않는 곳) 시·도만 쓴다. 예전엔 주소를
 * 공백으로 쪼개 둘째 토큰을 시군구로 삼았는데, 세종은 그 자리가 도로명이라
 * "세종특별자치시 한누리대로"가 지역 이름인 척 나왔다.
 */
export function regionSummary(
  sido: string | null | undefined,
  sigungu: string | null | undefined,
): string {
  const s = shortSido(sido);
  const g = (sigungu ?? '').trim();
  // 시군구 자리에 도로·지번이 들어온 경우를 거른다 — 행정구역은 시/군/구로 끝난다.
  const gu = /[시군구]$/.test(g) ? g : '';
  return [s, gu].filter(Boolean).join(' ');
}

/**
 * 주소 문자열에서 시·도를 뽑는다. `spots.region_sido`가 없을 때의 대비책이다.
 * (실측: region_sido는 22,657곳 중 5곳만 비어 있다)
 */
export function extractSido(address: string | null | undefined): string {
  return (address ?? '').trim().split(/\s+/)[0] ?? '';
}
