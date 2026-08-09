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
