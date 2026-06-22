import type {
  User, Dog, Spot, PawCheckin, SavedSpot,
  SpotVisitSummary, FamiliarDogSignal, PrivacySetting,
} from '../types';
import { seedParkSpots } from './seedParkSpots';

// ─────────────────────────────────────────
// USER & DOG
// ─────────────────────────────────────────
export const mockUser: User = {
  user_id: 'usr_001',
  login_type: 'apple',
  created_at: '2026-03-01T09:00:00+09:00',
  last_active_at: '2026-04-21T08:30:00+09:00',
  status: 'active',
};

export const mockDog: Dog = {
  dog_id: 'dog_001',
  user_id: 'usr_001',
  name: '보리',
  avatar_url: 'https://placedog.net/200/200?id=38',
  breed: '말티즈',
  weight_kg: 3.8,
  size: 'small',
  age_group: 'adult',
  temperament_tags: ['quiet', 'shy'],
  walking_style_tags: ['sniffing', 'slow_pace'],
  created_at: '2026-03-01T09:05:00+09:00',
  is_active: true,
};

export const mockDog2: Dog = {
  dog_id: 'dog_002',
  user_id: 'usr_001',
  name: '콩이',
  avatar_url: 'https://placedog.net/200/200?id=37',
  breed: '비글',
  weight_kg: 9.2,
  size: 'medium',
  age_group: 'puppy',
  temperament_tags: ['active', 'friendly'],
  walking_style_tags: ['long_walks', 'frequent_walks'],
  created_at: '2026-02-15T09:05:00+09:00',
  is_active: true,
};

export const mockDog3: Dog = {
  dog_id: 'dog_004',
  user_id: 'usr_001',
  name: '아몬드',
  avatar_url: 'https://placedog.net/200/200?id=36',
  breed: '푸들',
  weight_kg: 5.2,
  size: 'small',
  age_group: 'senior',
  temperament_tags: ['quiet', 'gentle'],
  walking_style_tags: ['slow_pace', 'sniffing'],
  created_at: '2025-11-10T09:05:00+09:00',
  is_active: true,
};

export const mockDogs: Dog[] = [mockDog, mockDog2, mockDog3];

export const mockPrivacySetting: PrivacySetting = {
  privacy_setting_id: 'pri_001',
  dog_id: 'dog_001',
  default_visibility_level: 'spot_only',
  allow_familiar_layer_exposure: true,
  allow_future_reactions: false,
  updated_at: '2026-04-01T10:00:00+09:00',
};

// ─────────────────────────────────────────
// SPOTS (서울 마포구·용산구 중심)
// ─────────────────────────────────────────
export const mockSpots: Spot[] = [
  {
    spot_id: 'spot_001',
    name: '한강 망원지구',
    category: 'riverside',
    latitude: 37.5567,
    longitude: 126.9016,
    address_text: '서울특별시 마포구 망원동 395',
    neighborhood: '망원',
    cover_image_url: 'https://placedog.net/400/300?id=16',
    opening_hours: '연중무휴 · 24시간',
    features: ['넓은 잔디밭', '강변 산책로', '쉼터 있음', '주차 가능'],
    description: '한강변을 따라 이어지는 넓은 산책로예요. 강아지와 함께 여유롭게 걷기 좋아요.',
    caution: '자전거 통행이 많아요 · 목줄은 필수입니다',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-10T10:00:00+09:00',
  },
  {
    spot_id: 'spot_002',
    name: '망원 작은 공원',
    category: 'park',
    latitude: 37.5541,
    longitude: 126.9121,
    address_text: '서울특별시 마포구 망원동 428',
    neighborhood: '망원',
    cover_image_url: 'https://placedog.net/400/300?id=29',
    description: '동네에서 잠깐 쉬어가기 좋은 아담한 공원이에요. 조용하고 아늑한 분위기예요.',
    opening_hours: '06:00 – 22:00',
    features: ['벤치 있어요', '그늘 있음', '강아지 친화적'],
    caution: '어린이 놀이터 근처 조용히 해주세요',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-12T10:00:00+09:00',
  },
  {
    spot_id: 'spot_003',
    name: '경의선 책거리 숲길',
    category: 'trail',
    latitude: 37.5504,
    longitude: 126.9214,
    address_text: '서울특별시 마포구 연남로 137-1',
    neighborhood: '홍대입구',
    cover_image_url: 'https://placedog.net/400/300?id=11',
    description: '철길 따라 조성된 나무 그늘 가득한 산책로예요. 조용히 산책하기에 딱 좋아요.',
    opening_hours: '연중무휴 · 24시간 개방',
    features: ['나무 그늘 많아요', '평지에요', '벤치 있어요', '포장길'],
    caution: '자전거 통행 주의 · 목줄은 필수입니다',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-15T10:00:00+09:00',
  },
  {
    spot_id: 'spot_004',
    name: '용산가족공원',
    category: 'park',
    latitude: 37.5257,
    longitude: 126.9769,
    address_text: '서울 용산구 용산동6가',
    neighborhood: '용산',
    cover_image_url: 'https://placedog.net/400/300?id=20',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-18T10:00:00+09:00',
  },
  {
    spot_id: 'spot_005',
    name: '이태원 해방촌 뒷길',
    category: 'trail',
    latitude: 37.5444,
    longitude: 126.9909,
    address_text: '서울 용산구 용산2가동',
    neighborhood: '이태원',
    cover_image_url: 'https://placedog.net/400/300?id=65',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-20T10:00:00+09:00',
  },
  {
    spot_id: 'spot_006',
    name: '성수 서울숲 산책로',
    category: 'trail',
    latitude: 37.5444,
    longitude: 127.0374,
    address_text: '서울 성동구 성수동1가',
    neighborhood: '성수',
    cover_image_url: 'https://placedog.net/400/300?id=46',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-22T10:00:00+09:00',
  },
  {
    spot_id: 'spot_007',
    name: '마포 하늘공원 길',
    category: 'park',
    latitude: 37.5704,
    longitude: 126.8918,
    address_text: '서울 마포구 상암동',
    neighborhood: '상암',
    cover_image_url: 'https://placedog.net/400/300?id=68',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-01-25T10:00:00+09:00',
  },
  {
    spot_id: 'spot_008',
    name: '합정역 주변 골목',
    category: 'rest_spot',
    latitude: 37.5497,
    longitude: 126.9143,
    address_text: '서울 마포구 합정동',
    neighborhood: '합정',
    cover_image_url: 'https://placedog.net/400/300?id=37',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-02-01T10:00:00+09:00',
  },
  {
    spot_id: 'spot_009',
    name: '연남동 연트럴파크',
    category: 'park',
    latitude: 37.5622,
    longitude: 126.9247,
    address_text: '서울 마포구 연남동',
    neighborhood: '연남',
    cover_image_url: 'https://placedog.net/400/300?id=7',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-02-05T10:00:00+09:00',
  },
  {
    spot_id: 'spot_010',
    name: '한강 반포지구',
    category: 'riverside',
    latitude: 37.5121,
    longitude: 126.9994,
    address_text: '서울 서초구 반포동',
    neighborhood: '반포',
    cover_image_url: 'https://placedog.net/400/300?id=22',
    status: 'active',
    created_source: 'seed',
    created_at: '2026-02-10T10:00:00+09:00',
  },
  // ─────────────────────────────────────────
  // 공공데이터포털 도시공원 표준데이터 (서울시 34개)
  // place-ingestor 정규화 결과를 자동 생성한 seedParkSpots 에서 병합
  // ─────────────────────────────────────────
  ...seedParkSpots,
];

// ─────────────────────────────────────────
// PAW CHECKINS (10~15개)
// ─────────────────────────────────────────
export const mockCheckins: PawCheckin[] = [
  // spot_001 - 한강 망원지구 (단골) — 72시간 내 체크인 포함
  {
    checkin_id: 'chk_001', dog_id: 'dog_001', spot_id: 'spot_001',
    checked_in_at: '2026-04-25T07:20:00+09:00',
    feeling_tags: ['quiet', 'good'], note: '이른 아침이라 한산해요', photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-25T07:20:10+09:00',
  },
  {
    checkin_id: 'chk_002', dog_id: 'dog_001', spot_id: 'spot_001',
    checked_in_at: '2026-04-24T18:30:00+09:00',
    feeling_tags: ['good', 'come_back_again'], note: undefined, photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-24T18:30:05+09:00',
  },
  {
    checkin_id: 'chk_003', dog_id: 'dog_001', spot_id: 'spot_001',
    checked_in_at: '2026-04-21T08:10:00+09:00',
    feeling_tags: ['quiet'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-21T08:10:05+09:00',
  },
  {
    checkin_id: 'chk_004', dog_id: 'dog_001', spot_id: 'spot_001',
    checked_in_at: '2026-04-18T07:50:00+09:00',
    feeling_tags: ['quiet', 'good_for_short_rest'], note: undefined, photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-18T07:50:05+09:00',
  },
  // spot_002 - 망원 작은 공원 (자주 가는 장소)
  {
    checkin_id: 'chk_005', dog_id: 'dog_001', spot_id: 'spot_002',
    checked_in_at: '2026-04-25T19:00:00+09:00',
    feeling_tags: ['many_dogs', 'good'], note: undefined, photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-25T19:00:05+09:00',
  },
  {
    checkin_id: 'chk_006', dog_id: 'dog_001', spot_id: 'spot_002',
    checked_in_at: '2026-04-24T18:45:00+09:00',
    feeling_tags: ['good'], note: '보리가 좋아하는 공원', photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-24T18:45:05+09:00',
  },
  // spot_003 - 경의선 책거리 (방문 있음)
  {
    checkin_id: 'chk_007', dog_id: 'dog_001', spot_id: 'spot_003',
    checked_in_at: '2026-04-12T10:30:00+09:00',
    feeling_tags: ['quiet', 'good_for_short_rest'], note: undefined, photo_url: undefined,
    visibility_level: 'private', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-12T10:30:05+09:00',
  },
  // spot_009 - 연남동 연트럴파크 (방문 있음)
  {
    checkin_id: 'chk_008', dog_id: 'dog_001', spot_id: 'spot_009',
    checked_in_at: '2026-04-19T17:00:00+09:00',
    feeling_tags: ['many_dogs', 'noisy'], note: undefined, photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-19T17:00:05+09:00',
  },
  // 타 강아지 발도장들 — 자주 찾는 강아지 섹션 노출 조건 충족 (familiar_layer × 2 이상)
  // dog_009 / spot_001 — 2회
  {
    checkin_id: 'chk_009', dog_id: 'dog_009', spot_id: 'spot_001',
    checked_in_at: '2026-04-28T06:50:00+09:00',
    feeling_tags: ['quiet'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-28T06:50:05+09:00',
  },
  {
    checkin_id: 'chk_009b', dog_id: 'dog_009', spot_id: 'spot_001',
    checked_in_at: '2026-04-22T06:50:00+09:00',
    feeling_tags: ['quiet'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-22T06:50:05+09:00',
  },
  // dog_007 / spot_001 — 3회
  {
    checkin_id: 'chk_010', dog_id: 'dog_007', spot_id: 'spot_001',
    checked_in_at: '2026-04-27T07:30:00+09:00',
    feeling_tags: ['quiet', 'good'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-27T07:30:05+09:00',
  },
  {
    checkin_id: 'chk_010b', dog_id: 'dog_007', spot_id: 'spot_001',
    checked_in_at: '2026-04-23T07:30:00+09:00',
    feeling_tags: ['good'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-23T07:30:05+09:00',
  },
  {
    checkin_id: 'chk_010c', dog_id: 'dog_007', spot_id: 'spot_001',
    checked_in_at: '2026-04-19T08:00:00+09:00',
    feeling_tags: ['good'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-19T08:00:05+09:00',
  },
  // dog_005 / spot_002 — 2회 (familiar_layer로 변경)
  {
    checkin_id: 'chk_011', dog_id: 'dog_005', spot_id: 'spot_002',
    checked_in_at: '2026-04-28T08:15:00+09:00',
    feeling_tags: ['many_dogs'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-28T08:15:05+09:00',
  },
  {
    checkin_id: 'chk_011b', dog_id: 'dog_005', spot_id: 'spot_002',
    checked_in_at: '2026-04-21T09:00:00+09:00',
    feeling_tags: ['good'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-21T09:00:05+09:00',
  },
  {
    checkin_id: 'chk_012', dog_id: 'dog_003', spot_id: 'spot_004',
    checked_in_at: '2026-04-25T09:00:00+09:00',
    feeling_tags: ['good', 'quiet'], note: undefined, photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-25T09:00:05+09:00',
  },
  // ── spot_001 72시간 내 체크인 (최근 흔적 섹션용) ──────────────────
  // dog_001 (보리) — 사진 포함
  {
    checkin_id: 'chk_015', dog_id: 'dog_001', spot_id: 'spot_001',
    checked_in_at: '2026-04-30T07:35:00+09:00',
    feeling_tags: ['quiet', 'good'], note: '이른 아침이라 한산해요. 보리도 신나게 뛰었어요 🐾',
    photo_url: 'https://placedog.net/400/300?id=43',
    visibility_level: 'spot_only', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-30T07:35:10+09:00',
  },
  // dog_001 (보리) — 메모만
  {
    checkin_id: 'chk_016', dog_id: 'dog_001', spot_id: 'spot_001',
    checked_in_at: '2026-04-29T18:20:00+09:00',
    feeling_tags: ['come_back_again', 'good'], note: '강변 노을 보면서 산책 최고예요',
    photo_url: undefined,
    visibility_level: 'spot_only', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-29T18:20:10+09:00',
  },
  // dog_011 (마루) / spot_001 — 2회
  {
    checkin_id: 'chk_013', dog_id: 'dog_011', spot_id: 'spot_001',
    checked_in_at: '2026-04-29T07:10:00+09:00',
    feeling_tags: ['good', 'many_dogs'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-29T07:10:05+09:00',
  },
  {
    checkin_id: 'chk_013b', dog_id: 'dog_011', spot_id: 'spot_001',
    checked_in_at: '2026-04-25T08:40:00+09:00',
    feeling_tags: ['good'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'spot_detail',
    is_valid_for_aggregate: true, created_at: '2026-04-25T08:40:05+09:00',
  },
  // dog_013 (크림) / spot_001 — 2회
  {
    checkin_id: 'chk_014', dog_id: 'dog_013', spot_id: 'spot_001',
    checked_in_at: '2026-04-28T17:30:00+09:00',
    feeling_tags: ['quiet', 'good_for_short_rest'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-28T17:30:05+09:00',
  },
  {
    checkin_id: 'chk_014b', dog_id: 'dog_013', spot_id: 'spot_001',
    checked_in_at: '2026-04-22T17:00:00+09:00',
    feeling_tags: ['quiet'], note: undefined, photo_url: undefined,
    visibility_level: 'familiar_layer', source_type: 'home',
    is_valid_for_aggregate: true, created_at: '2026-04-22T17:00:05+09:00',
  },
];

// ─────────────────────────────────────────
// SAVED SPOTS
// ─────────────────────────────────────────
export const mockSavedSpots: SavedSpot[] = [
  {
    saved_spot_id: 'sav_001', dog_id: 'dog_001', spot_id: 'spot_004',
    saved_type: 'want_to_go', saved_at: '2026-04-10T14:00:00+09:00',
  },
  {
    saved_spot_id: 'sav_002', dog_id: 'dog_001', spot_id: 'spot_006',
    saved_type: 'want_to_go', saved_at: '2026-04-15T16:30:00+09:00',
  },
  {
    saved_spot_id: 'sav_003', dog_id: 'dog_001', spot_id: 'spot_003',
    saved_type: 'go_again', saved_at: '2026-04-12T10:35:00+09:00',
  },
];

// ─────────────────────────────────────────
// SPOT VISIT SUMMARIES
// ─────────────────────────────────────────
export const mockVisitSummaries: SpotVisitSummary[] = [
  {
    summary_id: 'svs_001', dog_id: 'dog_001', spot_id: 'spot_001',
    first_visit_at: '2026-03-05T07:30:00+09:00',
    last_visit_at: '2026-04-21T07:20:00+09:00',
    visit_count: 12, last_30d_visit_count: 4,
    regular_status: 'regular',
    last_visible_tags: ['quiet', 'good'],
    updated_at: '2026-04-21T07:20:10+09:00',
  },
  {
    summary_id: 'svs_002', dog_id: 'dog_001', spot_id: 'spot_002',
    first_visit_at: '2026-03-20T18:00:00+09:00',
    last_visit_at: '2026-04-20T19:00:00+09:00',
    visit_count: 5, last_30d_visit_count: 2,
    regular_status: 'candidate',
    last_visible_tags: ['good', 'many_dogs'],
    updated_at: '2026-04-20T19:00:10+09:00',
  },
  {
    summary_id: 'svs_003', dog_id: 'dog_001', spot_id: 'spot_003',
    first_visit_at: '2026-04-12T10:30:00+09:00',
    last_visit_at: '2026-04-12T10:30:00+09:00',
    visit_count: 1, last_30d_visit_count: 1,
    regular_status: 'none',
    last_visible_tags: ['quiet'],
    updated_at: '2026-04-12T10:30:10+09:00',
  },
  {
    summary_id: 'svs_004', dog_id: 'dog_001', spot_id: 'spot_009',
    first_visit_at: '2026-04-19T17:00:00+09:00',
    last_visit_at: '2026-04-19T17:00:00+09:00',
    visit_count: 1, last_30d_visit_count: 1,
    regular_status: 'none',
    last_visible_tags: ['many_dogs'],
    updated_at: '2026-04-19T17:00:10+09:00',
  },
];

// ─────────────────────────────────────────
// FAMILIAR DOG SIGNALS
// ─────────────────────────────────────────

// 다른 강아지 데이터 (자주 찾는 강아지 섹션용)
// avatar_url: placedog.net?id=N — 강아지 사진, id 고정으로 항상 동일 이미지, 로드 안정성 보장
export const mockOtherDogs: Pick<Dog, 'dog_id' | 'name' | 'size' | 'age_group' | 'breed' | 'temperament_tags' | 'avatar_url'>[] = [
  {
    dog_id: 'dog_009', name: '두부', breed: '포메라니안', size: 'small', age_group: 'adult',
    temperament_tags: ['quiet', 'shy'],
    avatar_url: 'https://placedog.net/200/200?id=33',
  },
  {
    dog_id: 'dog_007', name: '코코', breed: '비숑', size: 'small', age_group: 'adult',
    temperament_tags: ['friendly', 'active'],
    avatar_url: 'https://placedog.net/200/200?id=37',
  },
  {
    dog_id: 'dog_011', name: '마루', breed: '골든리트리버', size: 'large', age_group: 'adult',
    temperament_tags: ['active', 'friendly'],
    avatar_url: 'https://placedog.net/200/200?id=38',
  },
  {
    dog_id: 'dog_013', name: '크림', breed: '말티푸', size: 'small', age_group: 'puppy',
    temperament_tags: ['quiet'],
    avatar_url: 'https://placedog.net/200/200?id=21',
  },
  {
    dog_id: 'dog_005', name: '모카', breed: '시바', size: 'medium', age_group: 'adult',
    temperament_tags: ['active'],
    avatar_url: 'https://placedog.net/200/200?id=25',
  },
  {
    dog_id: 'dog_003', name: '하루', breed: '말티즈', size: 'small', age_group: 'puppy',
    temperament_tags: ['quiet', 'sensitive'],
    avatar_url: 'https://placedog.net/200/200?id=33',
  },
];

export const mockFamiliarDogSignals: FamiliarDogSignal[] = [
  // spot_001 — 한강 망원지구 (4마리)
  {
    familiar_signal_id: 'fam_001', spot_id: 'spot_001', visible_dog_id: 'dog_009',
    recent_visible_checkin_count: 4,
    recent_last_seen_at: '2026-04-28T06:50:00+09:00',
    exposure_allowed: true,
    updated_at: '2026-04-28T07:00:00+09:00',
  },
  {
    familiar_signal_id: 'fam_002', spot_id: 'spot_001', visible_dog_id: 'dog_007',
    recent_visible_checkin_count: 3,
    recent_last_seen_at: '2026-04-27T07:30:00+09:00',
    exposure_allowed: true,
    updated_at: '2026-04-27T08:00:00+09:00',
  },
  {
    familiar_signal_id: 'fam_004', spot_id: 'spot_001', visible_dog_id: 'dog_011',
    recent_visible_checkin_count: 2,
    recent_last_seen_at: '2026-04-29T07:10:00+09:00',
    exposure_allowed: true,
    updated_at: '2026-04-29T07:20:00+09:00',
  },
  {
    familiar_signal_id: 'fam_005', spot_id: 'spot_001', visible_dog_id: 'dog_013',
    recent_visible_checkin_count: 2,
    recent_last_seen_at: '2026-04-28T17:30:00+09:00',
    exposure_allowed: true,
    updated_at: '2026-04-28T17:40:00+09:00',
  },
  // spot_002 — 망원 작은 공원 (1마리)
  {
    familiar_signal_id: 'fam_003', spot_id: 'spot_002', visible_dog_id: 'dog_005',
    recent_visible_checkin_count: 2,
    recent_last_seen_at: '2026-04-28T08:15:00+09:00',
    exposure_allowed: true,
    updated_at: '2026-04-28T08:30:00+09:00',
  },
];
