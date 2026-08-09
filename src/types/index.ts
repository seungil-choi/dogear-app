// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────
export type DogSize = 'small' | 'medium' | 'large';
export type DogAgeGroup = 'puppy' | 'adult' | 'senior';
/**
 * 장소 유형. DB의 spot_category enum과 값이 정확히 일치해야 한다.
 *  - 산책지: park · trail · riverside · rest_spot · beach
 *  - 시설  : pet_cafe · vet · pet_grooming · pet_boarding
 * 시설 목록은 constants/spotCategories의 FACILITY_CATEGORIES를 쓴다.
 */
export type SpotCategory =
  | 'park' | 'trail' | 'riverside' | 'rest_spot' | 'beach'
  | 'pet_cafe' | 'vet' | 'pet_grooming' | 'pet_boarding'
  // 사용자 제안 전용 — 맞는 유형이 없을 때. 공공데이터에는 없다.
  | 'other';
export type SpotStatus = 'active' | 'hidden' | 'archived';
export type VisibilityLevel = 'private' | 'spot_only' | 'familiar_layer';
export type RegularStatus = 'none' | 'candidate' | 'regular';
export type AtmosphereState = 'quiet' | 'active' | 'mixed' | 'unknown';
export type PinVariant = 'default' | 'recent_trace' | 'visited' | 'regular';
export type SavedType = 'want_to_go' | 'go_again';

export type FeelingTag =
  | 'quiet'
  | 'good'
  | 'many_dogs'
  | 'come_back_again'
  | 'noisy'
  | 'good_for_short_rest';

// ─────────────────────────────────────────
// DOMAIN ENTITIES
// ─────────────────────────────────────────
export interface User {
  user_id: string;
  /**
   * Supabase Auth의 사용자 ID(auth.users.id = auth.uid()).
   * user_id(앱 내부 식별자)와 값이 다르므로 혼동 금지.
   *  - RLS가 auth.uid()로 검사하는 곳(events 등)에는 반드시 이 값을 쓴다.
   */
  auth_id: string;
  login_type: 'apple' | 'google' | 'email';
  created_at: string;
  last_active_at?: string;
  status: 'active' | 'blocked' | 'deleted';
}

export interface Dog {
  dog_id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  /** 한 줄 소개 (선택, 최대 80자) — 성격 태그로는 전해지지 않는 한마디 */
  bio?: string;
  breed?: string;         // 품종 (e.g., '말티즈', '푸들')
  weight_kg?: number;     // 체중
  size: DogSize;
  age_group: DogAgeGroup;
  temperament_tags: string[];
  walking_style_tags: string[];
  created_at: string;
  is_active: boolean;
  /** soft delete 타임스탬프. NULL/undefined = 활성. 값 있으면 30일 grace 중. */
  deleted_at?: string | null;
}

export interface Spot {
  spot_id: string;
  name: string;
  category: SpotCategory;
  /** 공원구분 원본 텍스트 (예: '어린이공원', '근린공원') — 커버 일러스트 매핑 키 */
  subcategory?: string | null;
  latitude: number;
  longitude: number;
  address_text?: string;
  neighborhood?: string;
  cover_image_url?: string;
  opening_hours?: string;   // 운영 시간 (e.g., '연중무휴 · 24시간 개방')
  features?: string[];      // 특징 태그 (e.g., ['나무 그늘 많아요', '평지에요'])
  description?: string;  // 한 줄 설명
  caution?: string;         // 주의사항
  status: SpotStatus;
  created_source: 'seed' | 'admin' | 'user_suggested';
  created_at: string;
}

export interface PawCheckin {
  checkin_id: string;
  dog_id: string;
  spot_id: string;
  checked_in_at: string;
  feeling_tags: FeelingTag[];
  note?: string;
  photo_url?: string;
  visibility_level: VisibilityLevel;
  source_type: 'home' | 'spot_detail' | 'global_cta' | 'spot_search';
  is_valid_for_aggregate: boolean;
  created_at: string;
}

export interface SavedSpot {
  saved_spot_id: string;
  dog_id: string;
  spot_id: string;
  saved_type: SavedType;
  saved_at: string;
}

export interface SpotVisitSummary {
  summary_id: string;
  dog_id: string;
  spot_id: string;
  first_visit_at: string;
  last_visit_at: string;
  visit_count: number;
  last_30d_visit_count: number;
  regular_status: RegularStatus;
  last_visible_tags?: FeelingTag[];
  updated_at: string;
}

export interface FamiliarDogSignal {
  familiar_signal_id: string;
  spot_id: string;
  visible_dog_id: string;
  recent_visible_checkin_count: number;
  recent_last_seen_at: string;
  exposure_allowed: boolean;
  updated_at: string;
}

export interface PrivacySetting {
  privacy_setting_id: string;
  dog_id: string;
  default_visibility_level: VisibilityLevel;
  allow_familiar_layer_exposure: boolean;
  allow_future_reactions: boolean;
  updated_at: string;
}

// ─────────────────────────────────────────
// VIEW MODELS
// ─────────────────────────────────────────
export interface HomeSpotCardViewModel {
  spot_id: string;
  name: string;
  /** 원본 유형 — 추천 대상 판정(isRecommendableCategory)·지도 핀에 쓴다 */
  category: SpotCategory;
  category_label: string;
  /** 공원구분 원본 텍스트 — 커버 일러스트 매핑 키 */
  subcategory?: string | null;
  distance_text: string;
  atmosphere_badges: string[];
  recent_trace_label?: string;
  has_visited: boolean;
  is_regular: boolean;
  cover_image_url?: string;
  /** 이 장소를 저장한 사람 수 — 장소 상세 키비주얼과 같은 저장 표시를 쓰기 위해 필요.
   *  서버 집계가 없는 로컬 폴백(데모·오프라인)에서는 0. */
  saved_count: number;
  /** saved_count를 만들 때 서버가 본 내 저장 여부. 낙관적 ±1 보정의 기준점(displaySavedCount). */
  server_is_saved: boolean;
  /** 방문 기록이 있을 때만 존재 */
  visit_count?: number;
  /** 마지막 방문 상대 시각 텍스트 (예: "어제", "3일 전") */
  last_visit_text?: string;
  /** 마지막 방문 ISO 타임스탬프 – 최신순 정렬용 */
  last_visit_at?: string;
}

export interface MapPinViewModel {
  spot_id: string;
  latitude: number;
  longitude: number;
  pin_variant: PinVariant;
  label?: string;
  name: string;
}

export interface MapBottomSheetCardViewModel {
  spot_id: string;
  name: string;
  distance_text: string;
  atmosphere_summary: string;
  relation_summary: string;
  is_saved: boolean;
  pin_variant: PinVariant;
  category_label: string;
}

export interface UserRelation {
  first_visit_text: string;
  visit_count: number;
  last_visit_text: string;
  regular_status_label: string;
  regular_status: RegularStatus;
}

export interface FamiliarDogCardViewModel {
  dog_id: string;
  name: string;
  avatar_url?: string;
  /** 견종 텍스트 — 바텀시트 '견종' 행에 단독 표시 (없으면 '') */
  breed_text: string;
  /** 크기 레이블 — 바텀시트 '몸집' 행에 표시 (예: '소형견') */
  size_label: string;
  /** 견종·나이 요약 — 목록 카드 서브 텍스트 (예: '말티즈 · 성견') */
  breed_age_text: string;
  temperament_preview: string[]; // 성향 1~2개 (완화된 표현)
  /** 완화된 최근성 표현 — 목록 카드에 표시 (정확한 시간 절대 불가) */
  recency_label: string;         // e.g., '최근 자주 찾고 있어요'
  /** 이 장소와의 관계 한 줄 — 바텀시트 상세에만 표시 */
  relation_text: string;         // e.g., '이 장소에 익숙한 강아지예요'
}

export interface TraceListItemViewModel {
  trace_id: string;
  relative_time_text: string;
  primary_tag_label: string;
  secondary_text?: string;
  has_photo: boolean;
  photo_count?: number;
}

/** spot-detail Edge Function 응답 (서버가 전체 강아지 기준으로 계산) */
export interface SpotDetailApiViewModel {
  spot: {
    spot_id: string;
    name: string;
    category: SpotCategory;
    subcategory: string | null;
    latitude: number;
    longitude: number;
    address_text: string | null;
    neighborhood: string | null;
    /** 대표 전화 — 시설(병원·미용)에만 대체로 존재. 산책지는 null */
    phone: string | null;
    /** 이 장소가 제공하는 서비스 전부. category는 그중 대표 1개 */
    services: SpotCategory[];
    cover_image_url: string | null;
    /** subcategory를 그대로 반복한 무의미한 설명은 서버가 걸러 null로 내린다 */
    description: string | null;
    /** 원천 데이터의 편의시설(화장실·음수대·주차장·놀이터 등) */
    facility_tags: string[];
    /** 검토 대기(hidden) — 제안자 본인에게만 보이는 상태 */
    is_pending_review: boolean;
  };
  atmosphere: {
    state: AtmosphereState;
    top_feeling_tags: FeelingTag[];
    recent_checkin_count: number;
    total_checkin_count: number;
  };
  /** 커뮤니티 누적 집계 (0이면 화면에서 숨긴다) */
  community: {
    unique_dog_count: number;
    saved_count: number;
    regular_dog_count: number;
    first_checkin_at: string | null;
    last_checkin_at: string | null;
  };
  user_relation: {
    visit_count: number;
    last_visit_at: string | null;
    first_visit_at: string | null;
    regular_status: RegularStatus;
    saved_type: SavedType | null;
    saved_at: string | null;
  } | null;
  familiar_dogs: {
    dog_id: string;
    name: string;
    avatar_url: string | null;
    size: string;
    temperament_tags: string[];
    recent_checkin_count: number;
    last_seen_at: string;
  }[];
  recent_traces: {
    checkin_id: string;
    feeling_tags: FeelingTag[];
    note: string | null;
    photo_url: string | null;
    checked_in_at: string;
  }[];
}

export interface SpotDetailViewModel {
  spot_id: string;
  name: string;
  category_label: string;
  /** 공원구분 원본 텍스트 — 키비주얼 일러스트 매핑 키 */
  subcategory?: string | null;
  distance_text: string;
  latitude: number;        // 미니맵 썸네일용 좌표
  longitude: number;
  neighborhood?: string;   // 동/구 수준 위치 (예: '마포구', '망원')
  region_summary?: string; // 시/도·구 수준 요약 (예: '서울 마포구')
  cover_image_url?: string;
  is_saved: boolean;
  atmosphere_summary: string;
  atmosphere_state: AtmosphereState;
  recent_trace_count: number;
  /** 발도장을 남긴 서로 다른 강아지 수 (누적) */
  unique_visitor_count: number;
  /** 누적 발도장 수 */
  total_checkin_count: number;
  /** 이 장소를 저장한 강아지 수 */
  saved_count: number;
  /** 단골로 판정된 강아지 수 */
  regular_dog_count: number;
  /** 첫 발도장이 찍힌 날 */
  first_checkin_at?: string | null;
  /** 검토 대기(제안 직후) 상태 — 본인에게만 보인다는 안내를 띄운다 */
  is_pending_review?: boolean;
  /** 원천 데이터의 편의시설 태그 */
  facility_tags?: string[];
  dominant_tags: string[];
  user_relation?: UserRelation;
  familiar_dogs: FamiliarDogCardViewModel[];
  recent_traces: TraceListItemViewModel[];
  // 장소 정보
  address_text?: string;
  /** 대표 전화 — 시설(병원·미용)에 주로 존재 */
  phone?: string;
  /** 제공 서비스 전부(대표 category 포함). 2개 이상일 때만 화면에 칩으로 보인다 */
  services?: SpotCategory[];
  opening_hours?: string;
  features?: string[];
  description?: string;
  caution?: string;
}

/** Edge Function spots-nearby 응답 뷰모델 */
export interface SpotCardViewModel {
  spotId: string;
  name: string;
  category: SpotCategory;
  subcategory?: string | null;
  latitude: number;
  longitude: number;
  addressText: string | null;
  neighborhood: string | null;
  coverImageUrl: string | null;
  distanceM: number;
  checkinCount: number;
  topFeelingTags: FeelingTag[];
  atmosphereState: AtmosphereState;
  userVisitCount: number;
  lastVisitAt: string | null;
  regularStatus: RegularStatus;
  savedType: SavedType | null;
}

export interface RegularSpotCardViewModel {
  spot_id: string;
  name: string;
  visit_count: number;
  last_visit_text: string;
  regular_status_label: string;
  regular_status: RegularStatus;
  category_label: string;
}

export interface VisitHistoryItemViewModel {
  checkin_id: string;
  spot_id: string;
  spot_name: string;
  checked_in_at_text: string;
  selected_tags: string[];
  note_preview?: string;
}

export interface SavedSpotCardViewModel {
  spot_id: string;
  name: string;
  category_label: string;
  distance_text: string;
  saved_type_label: string;
  is_visited: boolean;
}

export interface DogMapSpotViewModel {
  spot_id: string;
  name: string;
  latitude: number;
  longitude: number;
  visit_count: number;
  pin_variant: 'visited' | 'regular' | 'recent';
}

export interface ProfileViewModel {
  dog_id: string;
  dog_name: string;
  avatar_url?: string;
  size_label: string;
  age_group_label: string;
  temperament_tags: string[];
  walking_style_tags: string[];
  default_visibility_label: string;
  familiar_layer_enabled: boolean;
}

export interface PawCheckinFlowState {
  selected_spot?: HomeSpotCardViewModel;
  selected_tags: FeelingTag[];
  note: string;
  photo_url?: string;
  selected_visibility: VisibilityLevel;
  can_submit: boolean;
  current_step: number;
}

// Spot 집계
export interface SpotAggregate {
  spot_id: string;
  recent_trace_count: number;
  recent_unique_dog_count: number;
  dominant_feeling_tags: FeelingTag[];
  atmosphere_state: AtmosphereState;
}

// ─────────────────────────────────────────
// 장소 제안
// ─────────────────────────────────────────
export type SpotProposalStatus = 'proposed' | 'temp_reflected' | 'approved' | 'rejected';

export interface SuggestedSpot {
  suggestion_id: string;
  name: string;
  description: string;
  category: SpotCategory;
  additional_tags: string[];
  latitude: number;
  longitude: number;
  suggested_by_dog_id: string;
  status: SpotProposalStatus;
  suggested_at: string;
}

export interface NearbyDuplicate {
  spot_id: string;
  name: string;
  category: SpotCategory;
  category_label: string;
  distance_m: number;
  /** 10m 이내 + 동일 이름 + 동일 카테고리 → 제안 불가 */
  is_hard_block: boolean;
}

// ─────────────────────────────────────────
// UGC 모더레이션 (App Store 1.2 / Play UGC 정책 대응)
// ─────────────────────────────────────────
export type ReportTargetType = 'spot' | 'checkin' | 'dog' | 'user';
export type ReportReason =
  | 'inappropriate_content'   // 부적절한 콘텐츠 (음란·폭력 등)
  | 'harassment'              // 괴롭힘·혐오표현
  | 'spam'                    // 스팸·광고
  | 'misinformation'          // 잘못된 정보 (장소 정보 오류)
  | 'animal_abuse'            // 동물 학대
  | 'privacy_violation'       // 개인정보 침해
  | 'other';                  // 기타
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected';

export interface Report {
  report_id: string;
  reporter_user_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  detail?: string;
  status: ReportStatus;
  created_at: string;
}

export interface BlockedUser {
  block_id: string;
  blocker_user_id: string;
  blocked_user_id?: string;    // 사용자 단위 차단
  blocked_dog_id?: string;     // 강아지 단위 차단
  blocked_dog_name?: string;        // 표시용(비정규화) — 타 강아지 이름은 RLS로 못 읽으므로 차단 시점에 보관
  blocked_dog_avatar_url?: string;  // 표시용(비정규화)
  blocked_at: string;
}

// ─────────────────────────────────────────
// 약관 동의 (개인정보보호법 / 위치정보법 대응)
// ─────────────────────────────────────────
export interface ConsentRecord {
  /** 서비스 이용약관 — 필수 */
  terms_of_service: boolean;
  /** 개인정보 수집·이용 — 필수 */
  privacy_policy: boolean;
  /** 위치기반서비스 이용약관 — 필수 */
  location_terms: boolean;
  /** 마케팅 수신 — 선택 */
  marketing_optin?: boolean;
  agreed_at: string;
}
