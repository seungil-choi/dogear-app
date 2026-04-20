// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────
export type DogSize = 'small' | 'medium' | 'large';
export type DogAgeGroup = 'puppy' | 'adult' | 'senior';
export type SpotCategory = 'park' | 'trail' | 'riverside' | 'rest_spot';
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
  size: DogSize;
  age_group: DogAgeGroup;
  temperament_tags: string[];
  walking_style_tags: string[];
  created_at: string;
  is_active: boolean;
}

export interface Spot {
  spot_id: string;
  name: string;
  category: SpotCategory;
  latitude: number;
  longitude: number;
  address_text?: string;
  neighborhood?: string;
  cover_image_url?: string;
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
  category_label: string;
  distance_text: string;
  atmosphere_badges: string[];
  recent_trace_label?: string;
  has_visited: boolean;
  is_regular: boolean;
  cover_image_url?: string;
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
  size_label: string;
  temperament_preview: string[];
  last_seen_text: string;
}

export interface TraceListItemViewModel {
  trace_id: string;
  relative_time_text: string;
  primary_tag_label: string;
  secondary_text?: string;
  has_photo: boolean;
}

export interface SpotDetailViewModel {
  spot_id: string;
  name: string;
  category_label: string;
  distance_text: string;
  cover_image_url?: string;
  is_saved: boolean;
  atmosphere_summary: string;
  atmosphere_state: AtmosphereState;
  recent_trace_count: number;
  dominant_tags: string[];
  user_relation?: UserRelation;
  familiar_dogs: FamiliarDogCardViewModel[];
  recent_traces: TraceListItemViewModel[];
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
