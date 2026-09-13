import {
  formatKoreanAddress, joinAddressParts, extractNeighborhood,
  shortSido, regionSummary,
} from '../address';

describe('formatKoreanAddress', () => {
  it('안드로이드 formattedAddress에서 국가명을 떼어낸다', () => {
    expect(formatKoreanAddress({
      formattedAddress: '대한민국 서울특별시 마포구 월드컵북로 20',
    })).toBe('서울특별시 마포구 월드컵북로 20');
  });

  it('formattedAddress가 없으면(iOS) 조각을 잇는다', () => {
    expect(formatKoreanAddress({
      formattedAddress: null,
      region: '서울특별시',
      city: '마포구',
      district: '망원동',
      street: '월드컵북로',
      streetNumber: '20',
    })).toBe('서울특별시 마포구 망원동 월드컵북로 20');
  });

  it('region과 city가 같은 값으로 와도 한 번만 넣는다', () => {
    // 안드로이드 Geocoder가 한국 주소에서 실제로 이렇게 준다
    expect(formatKoreanAddress({
      region: '서울특별시',
      city: '서울특별시',
      subregion: '마포구',
    })).toBe('서울특별시 마포구');
  });

  it('아무 조각도 없으면 빈 문자열', () => {
    expect(formatKoreanAddress({})).toBe('');
    expect(formatKoreanAddress({ formattedAddress: '   ' })).toBe('');
  });

  it('국가명만 온 formattedAddress는 조각 조합으로 넘어간다', () => {
    expect(formatKoreanAddress({ formattedAddress: '대한민국', region: '제주특별자치도' }))
      .toBe('제주특별자치도');
  });
});

describe('joinAddressParts', () => {
  it('빈 값과 공백만 있는 조각은 건너뛴다', () => {
    expect(joinAddressParts({ region: '경기도', city: '  ', district: null, street: '중앙로' }))
      .toBe('경기도 중앙로');
  });

  it('앞 조각에 포함되는 값은 버린다', () => {
    // iOS에서 region "서울특별시" 뒤에 city "서울"이 오는 경우
    expect(joinAddressParts({ region: '서울특별시', city: '서울', district: '마포구' }))
      .toBe('서울특별시 마포구');
  });

  it('앞 글자만 같은 다른 지명은 버리지 않는다', () => {
    // "성남시"가 있다고 "성남대로"를 지우면 안 된다 — 중복 제거가 과하게 먹는지 잠근다
    expect(joinAddressParts({
      region: '경기도', city: '성남시', district: '분당구', street: '성남대로',
    })).toBe('경기도 성남시 분당구 성남대로');
  });

  it('한국식 순서(광역 → 기초 → 동 → 도로 → 번호)를 지킨다', () => {
    // 입력 객체의 키 순서와 무관하게 결과 순서가 고정돼야 한다
    expect(joinAddressParts({
      streetNumber: '20', street: '월드컵북로', district: '망원동', region: '서울특별시',
    })).toBe('서울특별시 망원동 월드컵북로 20');
  });
});

describe('extractNeighborhood', () => {
  it('구를 뽑는다', () => {
    expect(extractNeighborhood('서울특별시 마포구 월드컵북로 20')).toBe('마포구');
  });

  it('군을 뽑는다', () => {
    expect(extractNeighborhood('강원특별자치도 홍천군 홍천읍')).toBe('홍천군');
  });

  it('"대구광역시"의 앞 두 글자를 구로 오인하지 않는다', () => {
    expect(extractNeighborhood('대구광역시 중구 동성로')).toBe('중구');
  });

  it('구·군이 없으면 null', () => {
    expect(extractNeighborhood('세종특별자치시 한누리대로')).toBeNull();
  });

  it('끝에 붙어 있어도 뽑는다', () => {
    expect(extractNeighborhood('부산광역시 해운대구')).toBe('해운대구');
  });
});

/**
 * 지역 표기 (2026-09-13)
 *
 * 예전 규칙은 `replace(/특별시|광역시|도$/, '')` 한 줄이었다. 서울·경기만 맞고
 * 나머지는 조용히 깨졌다 — 운영 DB 실측 **6,082곳(27%)**이 잘못된 이름으로 보였다.
 * 아래 입력값은 전부 운영 DB에 실제로 들어 있는 문자열이다.
 */
describe('shortSido — 시·도 축약', () => {
  it('특별자치도를 깎아내지 않는다 (예전엔 "강원특별자치"가 됐다)', () => {
    expect(shortSido('강원특별자치도')).toBe('강원');   // 591곳
    expect(shortSido('전북특별자치도')).toBe('전북');   // 554곳
    expect(shortSido('제주특별자치도')).toBe('제주');   // 293곳
    expect(shortSido('세종특별자치시')).toBe('세종');   // 100곳
  });

  it('도는 관례대로 두 글자로 줄인다 (예전엔 "경상남"이었다)', () => {
    expect(shortSido('경상남도')).toBe('경남');   // 1,136곳
    expect(shortSido('경상북도')).toBe('경북');   //   924곳
    expect(shortSido('충청남도')).toBe('충남');   //   830곳
    expect(shortSido('충청북도')).toBe('충북');   //   609곳
  });

  it('2026-07-01 출범한 전남광주통합특별시 — 특별법상 약칭은 광주특별시다', () => {
    expect(shortSido('전남광주통합특별시')).toBe('광주');   // 1,045곳
  });

  it('원래 맞던 것들은 그대로', () => {
    expect(shortSido('서울특별시')).toBe('서울');
    expect(shortSido('경기도')).toBe('경기');
    expect(shortSido('부산광역시')).toBe('부산');
    expect(shortSido('인천광역시')).toBe('인천');
  });

  it('모르는 이름은 깎지 않는다 — 잘못 깎인 이름은 그럴듯해서 신고되지 않는다', () => {
    expect(shortSido('어딘가특별한도')).toBe('어딘가특별한도');
    expect(shortSido('')).toBe('');
    expect(shortSido(null)).toBe('');
    expect(shortSido(undefined)).toBe('');
  });
});

describe('regionSummary — 「서울 마포구」 한 줄', () => {
  it('시·도 + 시군구', () => {
    expect(regionSummary('서울특별시', '마포구')).toBe('서울 마포구');
    expect(regionSummary('강원특별자치도', '강릉시')).toBe('강원 강릉시');
    expect(regionSummary('전남광주통합특별시', '순천시')).toBe('광주 순천시');
    expect(regionSummary('경기도', '가평군')).toBe('경기 가평군');
  });

  it('시군구 자리에 도로명이 오면 버린다 — 세종시는 시군구를 두지 않는다', () => {
    // 실제 주소: "세종특별자치시 한누리대로 ..." → 둘째 토큰이 도로명이다
    expect(regionSummary('세종특별자치시', '한누리대로')).toBe('세종');
    expect(regionSummary('세종특별자치시', null)).toBe('세종');
  });

  it('시군구가 없으면 시·도만', () => {
    expect(regionSummary('부산광역시', '')).toBe('부산');
    expect(regionSummary('부산광역시', undefined)).toBe('부산');
  });

  it('둘 다 없으면 빈 문자열', () => {
    expect(regionSummary(null, null)).toBe('');
  });
});

describe('지역 표기 규칙은 한 곳에만 둔다', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '../../..');

  it('시·도 축약을 정규식으로 다시 구현한 곳이 없다', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '__tests__') continue;
          walk(full);
        } else if (/\.tsx?$/.test(e.name) && !full.endsWith('utils/address.ts')) {
          const src = fs.readFileSync(full, 'utf8');
          if (/replace\([^)]*(특별시|광역시)/.test(src)) offenders.push(path.relative(root, full));
        }
      }
    };
    for (const d of ['app', 'src']) walk(path.join(root, d));
    expect(offenders).toEqual([]);
  });
});
