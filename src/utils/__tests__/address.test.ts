import { formatKoreanAddress, joinAddressParts, extractNeighborhood } from '../address';

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
