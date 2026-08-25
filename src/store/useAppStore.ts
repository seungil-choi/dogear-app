import { create, type StateCreator } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { IS_REAL_AUTH, IS_DEV_SEED } from '../config/env';
import type {
  User, Dog, Spot, PawCheckin, SavedSpot, SavedType, SpotVisitSummary,
  FamiliarDogSignal, PrivacySetting, VisibilityLevel, FeelingTag, AtmosphereState,
  HomeSpotCardViewModel, SuggestedSpot, NearbyDuplicate, SpotCategory,
  Report, BlockedUser, ConsentRecord, ReportTargetType, ReportReason,
} from '../types';
import { setUserContext } from '../utils/analytics';

// haversineDistance는 utils/geo로 이관 (SSOT)
import { haversineDistance } from '../utils/geo';
import { toast } from '../utils/toast';
import { SAVE_SPOT_FAILED } from '../constants/messages';
import {
  computeSpotAggregate, buildHomeSpotCard, computeRegularStatus,
  buildFamiliarDogCards, buildTraceList, computeDogMapPinVariant,
} from '../utils/rules';
import { categoryLabel, atmosphereLabel, regularStatusLabel, visitDateText, relativeTime, distanceTextOr } from '../utils/labels';
import type { SpotDetailViewModel, DogMapSpotViewModel } from '../types';
import { mergeSpotList } from './spotMerge';
import { MAX_CHECKIN_PHOTOS } from '../config/checkin';
import {
  mockUser, mockDog, mockDogs, mockSpots, mockCheckins, mockSavedSpots,
  mockVisitSummaries, mockFamiliarDogSignals, mockPrivacySetting,
  mockOtherDogs,
} from '../data/mockData';

// 목업 시드 — .env의 EXPO_PUBLIC_DEV_SEED=true 일 때만 활성화
// 프로덕션 빌드: .env.production에 EXPO_PUBLIC_DEV_SEED=false 설정
const DEV_PREVIEW_SEED = IS_DEV_SEED;

/**
 * 메모리에 유지할 스팟 최대 개수.
 * 지도 팬마다 최대 150개씩 병합되는데 상한이 없으면 계속 쌓여
 * 카드·마커 계산이 매번 전체를 훑게 되고 지도가 점점 느려진다.
 * 화면에 필요한 건 현재 지역 주변뿐이므로 최근 갱신분만 남긴다.
 */

// ─── 기본 개인정보 설정 (강아지 신규 가입 시 사용) ─────────────────
const defaultPrivacySetting: PrivacySetting = {
  privacy_setting_id: 'ps_default',
  dog_id: '',
  default_visibility_level: 'spot_only',
  allow_familiar_layer_exposure: false,
  allow_future_reactions: false,
  updated_at: new Date().toISOString(),
};

// spots-nearby Edge Function이 계산한 장소별 커뮤니티 집계 (전체 강아지 기준)
export interface SpotServerAggregate {
  checkinCount: number;
  atmosphereState: AtmosphereState;
  topFeelingTags: FeelingTag[];
  /** 이 장소를 저장한 사람 수 — 내 저장 여부(savedSpots)와는 다른 값 */
  savedCount: number;
  /**
   * 서버가 응답을 만들 때 본 "내가 저장했는가". savedCount에 이미 반영돼 있다.
   * 로컬 savedSpots와 갈린 만큼만 ±1 보정하는 데 쓴다(displaySavedCount).
   */
  savedByMe: boolean;
}

// 서버 집계(전체 강아지) → computeSpotAggregate가 반환하는 SpotAggregate 형태로 변환
// 서버는 유니크 강아지 수를 따로 주지 않으므로 checkinCount를 trace/visitor 수의 대용으로 사용
function serverAggregateToSpotAggregate(spotId: string, agg?: SpotServerAggregate) {
  if (!agg) return null;
  return {
    spot_id: spotId,
    recent_trace_count: agg.checkinCount,
    recent_unique_dog_count: agg.checkinCount,
    dominant_feeling_tags: agg.topFeelingTags,
    atmosphere_state: agg.atmosphereState,
  };
}

// paw-checkin Edge Function이 돌려준 권위 있는 방문 집계 (로컬 추정 대신 이 값을 사용)
export interface PawCheckinServerResult {
  checkinId?: string;
  visitCount?: number;
  lastVisitAt?: string;
  regularStatus?: SpotVisitSummary['regular_status'];
}

interface AppState {
  // Auth
  user: User | null;
  dog: Dog | null;         // legacy alias → activeDog
  activeDog: Dog | null;   // 현재 활성 강아지
  /** 활성 강아지의 설정 — 아래 맵에서 파생된다 */
  privacySetting: PrivacySetting;
  /** 강아지별 공개 설정. 강아지를 바꾸면 여기서 꺼내 쓴다 */
  privacySettingsByDog: Record<string, PrivacySetting>;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  isAuthLoading: boolean;
  pushEnabled: boolean;   // 푸시 알림 수신 설정 (사용자 토글, 기본 on)

  // 약관 동의 (앱스토어/법규 대응)
  consent: ConsentRecord | null;

  // Location
  /**
   * 마지막으로 알려진 내 위치.
   * ⚠️ **나이를 반드시 함께 본다.** capturedAt 없이 쓰면 며칠 전 좌표인지 알 수 없다.
   *    발도장은 이 값을 신뢰하지 않고 제출 시점에 새로 읽는다(집에서 공원 발도장이
   *    찍히던 사고의 원인이 여기였다).
   */
  currentLocation: { latitude: number; longitude: number; accuracy?: number; capturedAt?: number } | null;

  // Dogs
  dogs: Dog[];

  // Data — Supabase 연동 전까지는 빈 배열로 시작 (mock 데이터 출시 빌드 차단)
  spots: Spot[];
  // 서버(spots-nearby)가 계산한 장소별 커뮤니티 집계 — 로컬 checkins(내 강아지 한정)로 재계산하지 않도록 보관
  spotAggregates: Record<string, SpotServerAggregate>;
  checkins: PawCheckin[];
  savedSpots: SavedSpot[];
  visitSummaries: SpotVisitSummary[];
  familiarSignals: FamiliarDogSignal[];
  suggestedSpots: SuggestedSpot[];

  // UGC 모더레이션
  reports: Report[];
  blockedUsers: BlockedUser[];

  // UI State
  selectedSpotId: string | null;

  // Paw Checkin Flow
  pawFlow: {
    step: number; // 1~5
    selectedSpot?: HomeSpotCardViewModel;
    selectedTags: FeelingTag[];
    note: string;
    /** @deprecated 단일 사진 — photoUris로 대체. 하위호환용으로 남김 */
    photoUri?: string;
    /** 발도장 첨부 사진 로컬 URI (최대 3장) */
    photoUris?: string[];
    visibility: VisibilityLevel;
  };
  /** 마지막으로 제출한 발도장의 공개 범위 — 다음 발도장의 기본값으로 사용 (persist) */
  lastUsedVisibility?: VisibilityLevel;
  /** 주변 스팟 페치 진행 중 (useNearbySpots가 set) — 홈/지도 스켈레톤 노출용. persist 안 함. */
  isSpotsLoading: boolean;
  setSpotsLoading: (loading: boolean) => void;
  /** 서버 상한(150)에 걸려 목록이 잘렸는지. true면 반경 안의 전부가 아니다. */
  spotsTruncated: boolean;
  setSpotsTruncated: (truncated: boolean) => void;

  // Actions
  completeOnboarding: () => void;
  login: () => void;
  logout: () => void;
  selectSpot: (spotId: string | null) => void;
  toggleSaveSpot: (spotId: string) => void;
  submitPawCheckin: (serverResult?: PawCheckinServerResult) => void;
  setPawStep: (step: number) => void;
  setPawSpot: (spot: HomeSpotCardViewModel) => void;
  setPawTags: (tags: FeelingTag[]) => void;
  setPawNote: (note: string) => void;
  setPawPhoto: (uri?: string) => void;
  /** 첨부 사진 목록 교체 (최대 3장) */
  setPawPhotos: (uris: string[]) => void;
  setPawVisibility: (v: VisibilityLevel) => void;
  resetPawFlow: () => void;
  /**
   * 활성 강아지의 공개 설정을 바꾸고 **서버에도 저장한다.**
   *
   * ⚠️ 예전엔 로컬 zustand만 바꿨다. 서버(familiar-dogs·notify-familiar)는
   *    privacy_settings 테이블을 실제로 보는데 앱이 한 번도 쓰지 않아서,
   *    "자주 만나는 강아지에게 보이기"를 꺼도 서버는 계속 켜진 걸로 봤다.
   *    처리방침 §6이 보장한 기능이 동작하지 않던 상태다.
   */
  updatePrivacySetting: (updates: Partial<PrivacySetting>) => Promise<void>;
  /** 서버에서 읽은 강아지별 설정을 한 번에 넣는다(로그인 직후) */
  setPrivacySettings: (rows: PrivacySetting[]) => void;

  // 발도장 삭제 (개인정보 자기결정권)
  deleteCheckin: (checkinId: string) => void;

  // 약관 동의
  setConsent: (consent: ConsentRecord) => void;

  // 회원 탈퇴 (App Store 5.1.1(v) 필수)
  // 실제 백엔드 연동 시 Supabase RPC + auth.users 삭제 필요
  deleteAccount: (reason?: string) => Promise<void>;

  // UGC 모더레이션 (App Store 1.2 필수)
  reportContent: (target_type: ReportTargetType, target_id: string, reason: ReportReason, detail?: string) => void;
  blockUser: (blocked_user_id: string, blocked_dog_id?: string, meta?: { name?: string; avatar_url?: string }) => void;
  unblockUser: (block_id: string) => void;
  setBlockedUsers: (blockedUsers: BlockedUser[]) => void;
  isUserBlocked: (user_id: string) => boolean;

  // 정보 수정 제안 (어드민 IA "신고 > 정보 수정 제안" 큐로 들어감)
  suggestEdit: (input: { spot_id: string; field: string; proposed_value: string; reason?: string }) => Promise<void>;

  // Supabase 연동 actions
  setUser: (user: User | null) => void;
  setActiveDog: (dog: Dog | null) => void;
  registerDog: (dog: Dog) => void;
  setDogs: (dogs: Dog[]) => void;
  /**
   * 강아지 soft delete.
   *   - IS_REAL_AUTH=true: supabase에서 deleted_at = NOW() update
   *   - 로컬 dogs 배열에서 제거 + activeDog 갱신 (첫 번째 남은 강아지로)
   *   - dogs.length === 1 일 때 호출하지 않도록 호출 측에서 가드
   * Returns: 성공 시 true, 실패 시 false (에러는 호출 측 알림)
   */
  deleteDog: (dog_id: string) => Promise<boolean>;
  setAuthLoading: (loading: boolean) => void;
  setCurrentLocation: (loc: { latitude: number; longitude: number; accuracy?: number } | null) => void;
  setPushEnabled: (enabled: boolean) => void;

  // 데이터 주입 (Supabase 페치 결과 반영용)
  setSpots: (spots: Spot[]) => void;
  setSpotAggregates: (aggregates: Record<string, SpotServerAggregate>) => void;
  /** 지도 이동 페치 결과를 기존 spots에 병합 (spot_id 중복 제거, 집계도 병합) — 다른 지역 탐색용 */
  mergeSpots: (spots: Spot[], aggregates?: Record<string, SpotServerAggregate>) => void;
  setCheckins: (checkins: PawCheckin[]) => void;
  setSavedSpots: (savedSpots: SavedSpot[]) => void;
  setVisitSummaries: (visitSummaries: SpotVisitSummary[]) => void;
  setFamiliarSignals: (signals: FamiliarDogSignal[]) => void;

  // Spot 제안 actions
  // 임시 반영: suggestedSpots 와 spots 양쪽에 모두 추가하여 제안 직후
  // 발도장 찍기 / 저장 등이 가능하도록 함. 새 spot_id를 반환.
  /**
   * 제안한 장소를 로컬에 즉시 반영하고 spot_id를 돌려준다.
   * @param serverSpotId 서버가 발급한 uuid. 실환경에서는 반드시 이 값을 넘길 것.
   *   넘기지 않으면 로컬 전용 임시 id가 되어 발도장·상세 조회가 서버에서 404가 난다.
   */
  suggestSpot: (data: {
    name: string;
    description: string;
    category: SpotCategory;
    additional_tags: string[];
    latitude: number;
    longitude: number;
    /** 역지오코딩으로 읽은 주소. 못 읽었으면 생략 */
    address_text?: string;
    /** 업로드된 public URL. 없으면 카드가 카테고리 일러스트로 떨어진다 */
    cover_image_url?: string;
  }, serverSpotId?: string | null) => string;
  getNearbyDuplicates: (lat: number, lng: number, name: string, category: SpotCategory) => NearbyDuplicate[];

  // Computed helpers
  getSpotDetail: (spotId: string) => SpotDetailViewModel | null;
  /**
   * 홈 추천 카드.
   * @param opts.includePending 검토 중(사용자 제안) 장소도 포함할지.
   *   홈 추천에는 넣지 않는다 — 아직 검증 안 된 곳을 앱이 먼저 권하는 꼴이 된다.
   *   지도 목록은 "주변에 뭐가 있나"를 보여주는 자리라 포함한다.
   */
  getHomeCards: (opts?: { includePending?: boolean }) => HomeSpotCardViewModel[];
  getDogMapSpots: () => DogMapSpotViewModel[];
  isSaved: (spotId: string) => boolean;
}

// ─── 초기 빈 상태 (logout/회원탈퇴 시 reset 용) ───────────────
const initialState = DEV_PREVIEW_SEED
  ? {
      user: mockUser,
      dog: mockDog,
      activeDog: mockDog,
      dogs: mockDogs,
      privacySetting: mockPrivacySetting,
      privacySettingsByDog: {},
      isAuthenticated: true,
      hasCompletedOnboarding: true,
      isAuthLoading: false,
      pushEnabled: true,
      consent: null,
      currentLocation: { latitude: 37.5443, longitude: 127.0376, accuracy: 10 },
      spots: mockSpots,
      spotAggregates: {},
      checkins: mockCheckins,
      savedSpots: mockSavedSpots,
      visitSummaries: mockVisitSummaries,
      familiarSignals: mockFamiliarDogSignals,
      suggestedSpots: [],
      reports: [],
      blockedUsers: [],
      selectedSpotId: null,
    }
  : {
      user: null,
      dog: null,
      activeDog: null,
      dogs: [],
      privacySetting: defaultPrivacySetting,
      privacySettingsByDog: {},
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      isAuthLoading: true,
      pushEnabled: true,
      consent: null,
      currentLocation: null,
      spots: [],
      spotAggregates: {},
      checkins: [],
      savedSpots: [],
      visitSummaries: [],
      familiarSignals: [],
      suggestedSpots: [],
      reports: [],
      blockedUsers: [],
      selectedSpotId: null,
    };

const storeImpl: StateCreator<AppState> = (set, get) => ({
  // ─── Initial State (mock 제거 — Supabase 페치로 채워짐) ─────────
  ...initialState,

  pawFlow: {
    step: 1,
    selectedTags: [],
    note: '',
    visibility: 'familiar_layer',
  },

  // ─── Actions ───────────────────────────────────
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  // 로그인:
  //  - DEV_SEED 모드: mock 데이터 복원 (사용자가 데모를 계속 진행)
  //  - 실 환경: isAuthenticated만 true (실제 user는 useAuth/setUser가 채움)
  login: () => {
    if (DEV_PREVIEW_SEED) {
      set({ ...initialState, isAuthenticated: true, hasCompletedOnboarding: get().hasCompletedOnboarding });
    } else {
      set({ isAuthenticated: true });
    }
  },
  // 로그아웃: 사용자 데이터 명시적 초기화
  // DEV_SEED 모드의 initialState도 isAuthenticated:true로 시작하므로
  // ...initialState 후 명시적으로 false 강제 (로그아웃이 즉시 무효화되는 문제 방지)
  logout: () => set({
    user: null,
    dog: null,
    dogs: [],
    activeDog: null,
    consent: get().consent,                                 // 약관 동의는 유지
    hasCompletedOnboarding: get().hasCompletedOnboarding,   // 온보딩 완료 상태 유지
    isAuthenticated: false,                                 // 명시적으로 false
    isAuthLoading: false,
    spots: [],
    spotAggregates: {},
    checkins: [],
    visitSummaries: [],
    savedSpots: [],
    familiarSignals: [],
    blockedUsers: [],
    reports: [],
    selectedSpotId: null,
    // 다음 계정이 이전 사용자 값을 상속하지 않도록 개인 설정/임시 데이터도 초기화
    privacySetting: defaultPrivacySetting,
    privacySettingsByDog: {},
    suggestedSpots: [],
    lastUsedVisibility: undefined,
    pawFlow: { step: 1, selectedTags: [], note: '', visibility: 'familiar_layer' },
  }),

  selectSpot: (spotId) => set({ selectedSpotId: spotId }),

  toggleSaveSpot: (spotId) => {
    const { savedSpots, dog, visitSummaries } = get();
    if (!dog) return;
    const existing = savedSpots.find(s => s.spot_id === spotId && s.dog_id === dog.dog_id);
    if (existing) {
      set({ savedSpots: savedSpots.filter(s => s.saved_spot_id !== existing.saved_spot_id) });
      // 실 환경: DB에서 삭제 — 실패 시 낙관적 변경을 되돌림(저장 상태가 새로고침 후 되살아나는 클레임 방지)
      if (IS_REAL_AUTH) {
        supabase.from('saved_spots')
          .delete()
          .eq('dog_id', dog.dog_id)
          .eq('spot_id', spotId)
          .then(({ error }) => {
            if (error) {
              console.error('saved_spots delete failed:', error);
              const cur = get().savedSpots;
              if (!cur.some(s => s.saved_spot_id === existing.saved_spot_id)) {
                set({ savedSpots: [...cur, existing] });
              }
              toast.error(SAVE_SPOT_FAILED.unsave);
            }
          });
      }
    } else {
      // 이미 방문한 적 있는 장소면 "다시 가고 싶다", 없으면 "가보고 싶다"
      const hasVisited = visitSummaries.some(v => v.spot_id === spotId && v.dog_id === dog.dog_id);
      const savedType: SavedType = hasVisited ? 'go_again' : 'want_to_go';
      const newSaved: SavedSpot = {
        saved_spot_id: `sav_${Date.now()}`,
        dog_id: dog.dog_id,
        spot_id: spotId,
        saved_type: savedType,
        saved_at: new Date().toISOString(),
      };
      set({ savedSpots: [...savedSpots, newSaved] });
      // 실 환경: DB에 저장 — 실패 시 낙관적 추가를 되돌림(저장했는데 사라지는 클레임 방지)
      if (IS_REAL_AUTH) {
        supabase.from('saved_spots')
          .insert({ dog_id: dog.dog_id, spot_id: spotId, saved_type: savedType })
          .then(({ error }) => {
            if (error) {
              console.error('saved_spots insert failed:', error);
              set({ savedSpots: get().savedSpots.filter(s => s.saved_spot_id !== newSaved.saved_spot_id) });
              toast.error(SAVE_SPOT_FAILED.save);
            }
          });
      }
    }
  },

  submitPawCheckin: (serverResult) => {
    const { pawFlow, dog, checkins, visitSummaries } = get();
    if (!dog || !pawFlow.selectedSpot) return;

    // 이번 선택을 다음 발도장 기본값으로 기억
    set({ lastUsedVisibility: pawFlow.visibility });

    const newCheckin: PawCheckin = {
      checkin_id: serverResult?.checkinId ?? `chk_${Date.now()}`,
      dog_id: dog.dog_id,
      spot_id: pawFlow.selectedSpot.spot_id,
      checked_in_at: new Date().toISOString(),
      feeling_tags: pawFlow.selectedTags,
      note: pawFlow.note || undefined,
      photo_url: pawFlow.photoUri,
      visibility_level: pawFlow.visibility,
      source_type: 'global_cta',
      is_valid_for_aggregate: true,
      created_at: new Date().toISOString(),
    };

    // 방문 요약 갱신
    const existing = visitSummaries.find(
      s => s.dog_id === dog.dog_id && s.spot_id === pawFlow.selectedSpot!.spot_id,
    );
    const now = new Date().toISOString();
    // 서버 집계가 있으면 그 값을 권위로 사용(로컬 +1 추정과 어긋나는 표시 방지), 없으면(데모) 로컬 추정
    const svLastVisitAt = serverResult?.lastVisitAt ?? now;
    let newSummaries: SpotVisitSummary[];
    if (existing) {
      newSummaries = visitSummaries.map(s =>
        s.summary_id === existing.summary_id
          ? {
              ...s,
              last_visit_at: svLastVisitAt,
              visit_count: serverResult?.visitCount ?? s.visit_count + 1,
              last_30d_visit_count: serverResult?.visitCount != null
                ? s.last_30d_visit_count // 서버 미제공 항목은 다음 동기화에서 보정
                : s.last_30d_visit_count + 1,
              regular_status: serverResult?.regularStatus ?? s.regular_status,
              updated_at: now,
            }
          : s,
      );
    } else {
      newSummaries = [
        ...visitSummaries,
        {
          summary_id: `svs_${Date.now()}`,
          dog_id: dog.dog_id,
          spot_id: pawFlow.selectedSpot!.spot_id,
          first_visit_at: svLastVisitAt,
          last_visit_at: svLastVisitAt,
          visit_count: serverResult?.visitCount ?? 1,
          last_30d_visit_count: 1,
          regular_status: serverResult?.regularStatus ?? ('none' as const),
          updated_at: now,
        },
      ];
    }

    set({
      checkins: [...checkins, newCheckin],
      visitSummaries: newSummaries,
    });
  },

  setPawStep: (step) => set(s => ({ pawFlow: { ...s.pawFlow, step } })),
  setPawSpot: (spot) => set(s => ({ pawFlow: { ...s.pawFlow, selectedSpot: spot } })),
  setPawTags: (tags) => set(s => ({ pawFlow: { ...s.pawFlow, selectedTags: tags } })),
  setPawNote: (note) => set(s => ({ pawFlow: { ...s.pawFlow, note } })),
  setPawPhoto: (uri) => set(s => ({ pawFlow: { ...s.pawFlow, photoUri: uri } })),
  // 상한은 고르는 화면에서도 막지만, 스토어에 들어오는 값은 여기서 한 번 더 자른다.
  // photoUri(단일)는 레거시 경로(로컬 기록·성공 화면)가 아직 읽으므로 첫 장을 채워 둔다.
  setPawPhotos: (uris) => set(s => ({
    pawFlow: {
      ...s.pawFlow,
      photoUris: uris.slice(0, MAX_CHECKIN_PHOTOS),
      photoUri: uris[0],
    },
  })),
  setPawVisibility: (v) => set(s => ({ pawFlow: { ...s.pawFlow, visibility: v } })),
  resetPawFlow: () =>
    set(s => ({
      // 마지막 제출 시 선택한 공개 범위 우선, 없으면 프라이버시 기본값
      pawFlow: {
        step: 1,
        selectedTags: [],
        note: '',
        visibility: s.lastUsedVisibility ?? s.privacySetting.default_visibility_level,
      },
    })),

  setPrivacySettings: (rows) => {
    const map: Record<string, PrivacySetting> = {};
    for (const r of rows) map[r.dog_id] = r;
    const { activeDog } = get();
    set({
      privacySettingsByDog: map,
      // 활성 강아지 것이 있으면 그것으로 맞춘다
      ...(activeDog && map[activeDog.dog_id] ? { privacySetting: map[activeDog.dog_id] } : {}),
    });
  },

  updatePrivacySetting: async (updates) => {
    const { activeDog, privacySetting, privacySettingsByDog } = get();
    const dogId = activeDog?.dog_id ?? privacySetting.dog_id;
    const next: PrivacySetting = {
      ...privacySetting, ...updates,
      dog_id: dogId,
      updated_at: new Date().toISOString(),
    };
    const prev = privacySetting;

    // 낙관적 반영 — 토글이 손가락을 따라오지 않으면 고장으로 읽힌다
    set({ privacySetting: next, privacySettingsByDog: { ...privacySettingsByDog, [dogId]: next } });

    if (!IS_REAL_AUTH || !dogId) return;

    // ⚠️ 서버에 반드시 써야 한다. 예전엔 로컬만 바꿔서, 사용자가 "보이기"를 꺼도
    //    familiar-dogs·notify-familiar는 계속 켜진 값을 읽었다(처리방침 §6 위반 상태).
    const { error } = await supabase
      .from('privacy_settings')
      .update({
        default_visibility_level: next.default_visibility_level,
        allow_familiar_layer_exposure: next.allow_familiar_layer_exposure,
        updated_at: next.updated_at,
      })
      .eq('dog_id', dogId);

    if (error) {
      // 되돌린다 — 껐다고 믿게 두는 게 가장 나쁘다
      console.error('[privacy] 저장 실패:', error.message);
      set({ privacySetting: prev, privacySettingsByDog: { ...privacySettingsByDog, [dogId]: prev } });
      toast.error('설정을 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요');
    }
  },

  // 발도장 삭제 — 본인 발도장만 삭제 가능
  deleteCheckin: (checkinId) => {
    const { checkins, dog } = get();
    if (!dog) return;
    set({ checkins: checkins.filter(c => !(c.checkin_id === checkinId && c.dog_id === dog.dog_id)) });
  },

  setConsent: (consent) => set({ consent }),

  // 회원탈퇴 — 서버 데이터 영구 삭제 후 클라이언트 상태 초기화
  deleteAccount: async (reason) => {
    if (IS_REAL_AUTH) {
      // delete-account Edge Function 호출 → auth.users cascade 삭제
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { reason: reason ?? '' },
      });
      if (error) {
        console.error('deleteAccount Edge Function error:', error);
        throw new Error('계정 삭제에 실패했어요');
      }
    }
    // 클라이언트 상태 초기화
    set({ ...initialState, isAuthLoading: false, hasCompletedOnboarding: false });
  },

  // UGC 신고
  reportContent: (target_type, target_id, reason, detail) => {
    const { reports, user } = get();
    const newReport: Report = {
      report_id: `rpt_${Date.now()}`,
      reporter_user_id: user?.user_id ?? 'anonymous',
      target_type,
      target_id,
      reason,
      detail,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    set({ reports: [...reports, newReport] });

    // 실 환경: Supabase reports 테이블 INSERT (fire-and-forget)
    // 테이블 컬럼: reporter_dog_id, target_type, target_id, report_type, description, status
    const { dog } = get();
    if (IS_REAL_AUTH && dog) {
      supabase.from('reports').insert({
        reporter_dog_id: dog.dog_id,
        target_type,
        target_id,
        report_type: reason,
        description: detail ?? null,
        status: 'pending',
      }).then(({ error }) => {
        if (error) console.error('report insert failed:', error);
      });
    }
  },

  // 정보 수정 제안 — 어드민 큐로 적재 (실 환경: edit_suggestions 테이블)
  suggestEdit: async (input) => {
    const { dog, user } = get();
    if (IS_REAL_AUTH && (dog || user)) {
      const { error } = await supabase.from('edit_suggestions').insert({
        spot_id: input.spot_id,
        suggester_dog_id: dog?.dog_id ?? null,
        suggester_user_id: user?.user_id ?? null,
        field: input.field,
        proposed_value: input.proposed_value,
        reason: input.reason ?? null,
        status: 'pending',
      });
      if (error) {
        console.error('edit_suggestions insert failed:', error);
        throw error;
      }
    }
    // DEV_SEED 모드: 메모리 로깅만 (실제 어드민에는 안 보이지만 사용자에게는 접수 완료 응답)
    // 추후 백엔드 연결 시 자동으로 어드민 큐에 들어감
  },

  blockUser: (blocked_user_id, blocked_dog_id, meta) => {
    const { blockedUsers, user } = get();
    if (!user) return;
    // dedup: 강아지 차단이면 dog_id 기준, 사용자 차단이면 user_id 기준
    //   (이전엔 항상 blocked_user_id로만 dedup해서, 익명(빈 user_id) 강아지 2건째가 조용히 무시됨)
    const dup = blocked_dog_id
      ? blockedUsers.some(b => b.blocked_dog_id === blocked_dog_id)
      : blockedUsers.some(b => b.blocked_user_id === blocked_user_id && !b.blocked_dog_id);
    if (dup) return;
    const tempId = `blk_${Date.now()}`;
    const newBlock: BlockedUser = {
      block_id: tempId,
      blocker_user_id: user.user_id,
      blocked_user_id: blocked_user_id || undefined,
      blocked_dog_id,
      blocked_dog_name: meta?.name,
      blocked_dog_avatar_url: meta?.avatar_url,
      blocked_at: new Date().toISOString(),
    };
    set({ blockedUsers: [...blockedUsers, newBlock] });  // 낙관적
    // 서버 영속화 (실환경) — 성공 시 임시 id를 서버 id로 교체
    if (IS_REAL_AUTH) {
      supabase.from('blocks').insert({
        blocker_user_id: user.user_id,
        blocked_user_id: blocked_user_id || null,
        blocked_dog_id: blocked_dog_id ?? null,
        blocked_dog_name: meta?.name ?? null,
        blocked_dog_avatar_url: meta?.avatar_url ?? null,
      }).select('block_id, created_at').single().then(({ data, error }) => {
        if (error || !data) {
          // 로컬만 유지하면 안 된다. 차단 목록은 다음 진입 때 서버 값으로 통째로 덮이므로
          // (useUserData가 blocks를 읽어 setBlockedUsers) 조용히 사라진다.
          // 게다가 서버에 없으면 spot-detail·familiar-dogs의 차단 필터도 적용되지 않아
          // "차단했다고 봤는데 계속 보이는" 상태가 된다 — 안전 기능에서 가장 나쁜 실패다.
          console.error('[blockUser] 서버 저장 실패:', error?.message);
          set(s => ({ blockedUsers: s.blockedUsers.filter(b => b.block_id !== tempId) }));
          toast.error('차단하지 못했어요. 연결을 확인하고 다시 시도해주세요');
          return;
        }
        set(s => ({
          blockedUsers: s.blockedUsers.map(b =>
            b.block_id === tempId ? { ...b, block_id: data.block_id, blocked_at: data.created_at } : b),
        }));
      });
    }
  },

  unblockUser: (block_id) => {
    const { blockedUsers } = get();
    const removed = blockedUsers.find(b => b.block_id === block_id);
    set({ blockedUsers: blockedUsers.filter(b => b.block_id !== block_id) });  // 낙관적
    if (IS_REAL_AUTH && !block_id.startsWith('blk_')) {
      supabase.from('blocks').delete().eq('block_id', block_id).then(({ error }) => {
        if (!error) return;
        // 서버에 남아 있으면 다음 진입 때 차단이 되살아난다. 화면을 사실에 맞춘다.
        console.error('[unblockUser] 서버 삭제 실패:', error.message);
        if (removed) {
          set(s => (s.blockedUsers.some(b => b.block_id === block_id)
            ? s
            : { blockedUsers: [...s.blockedUsers, removed] }));
        }
        toast.error('차단 해제를 하지 못했어요. 잠시 후 다시 시도해주세요');
      });
    }
  },

  setBlockedUsers: (blockedUsers) => set({ blockedUsers }),

  isUserBlocked: (user_id) => {
    return get().blockedUsers.some(b => b.blocked_user_id === user_id);
  },

  // Supabase 연동
  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
    // analytics 컨텍스트 동기화
    //   events.user_id는 FK가 auth.users(id)이고 RLS도 auth.uid()로 검사하므로
    //   앱 내부 식별자(user_id)가 아니라 auth_id를 넣어야 INSERT가 통과한다.
    setUserContext({ user_id: user?.auth_id ?? null });
  },
  setActiveDog: (dog) => {
    // 공개 설정은 강아지별이다 — 바꿀 때 같이 갈아끼우지 않으면
    // 스와이프해도 이전 강아지 값이 그대로 보인다.
    const map = get().privacySettingsByDog;
    const ps = dog ? map[dog.dog_id] : undefined;
    set({ activeDog: dog, dog, ...(ps ? { privacySetting: ps } : {}) });
    setUserContext({ dog_profile_id: dog?.dog_id ?? null });
  },
  registerDog: (newDog) => {
    const { dogs } = get();
    const exists = dogs.some(d => d.dog_id === newDog.dog_id);
    const updatedDogs = exists
      ? dogs.map(d => d.dog_id === newDog.dog_id ? newDog : d)
      : [...dogs, newDog];
    set({ dogs: updatedDogs, activeDog: newDog, dog: newDog });
    setUserContext({ dog_profile_id: newDog.dog_id });
  },
  setDogs: (dogs) => set({ dogs }),

  isSpotsLoading: false,
  setSpotsLoading: (isSpotsLoading) => set({ isSpotsLoading }),
  spotsTruncated: false,
  setSpotsTruncated: (spotsTruncated) => set({ spotsTruncated }),

  deleteDog: async (dog_id) => {
    if (IS_REAL_AUTH) {
      // SEC-18: soft-delete 시 is_active=false 동시 세팅.
      //   엣지펑션(familiar-dogs/spot-detail 등)이 is_active로만 필터하므로, deleted_at만 세팅하면
      //   삭제된 강아지가 익숙한 강아지/신호로 계속 노출된다.
      const { error } = await supabase
        .from('dogs')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('dog_id', dog_id);
      if (error) {
        console.warn('[deleteDog] supabase update failed:', error.message);
        return false;
      }
    }
    // 로컬 상태에서 제거 + activeDog 갱신
    const { dogs, activeDog } = get();
    const remaining = dogs.filter(d => d.dog_id !== dog_id);
    const nextActive =
      activeDog?.dog_id === dog_id ? (remaining[0] ?? null) : activeDog;
    set({ dogs: remaining, activeDog: nextActive, dog: nextActive });
    if (nextActive) setUserContext({ dog_profile_id: nextActive.dog_id });
    return true;
  },

  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  // 호출부가 빠뜨려도 나이를 알 수 있게 여기서 시각을 박는다.
  setCurrentLocation: (currentLocation) =>
    set({ currentLocation: currentLocation ? { capturedAt: Date.now(), ...currentLocation } : null }),
  setPushEnabled: (pushEnabled) => set({ pushEnabled }),

  setSpots: (spots) => set({ spots }),
  setSpotAggregates: (spotAggregates) => set({ spotAggregates }),
  mergeSpots: (newSpots, newAggregates) => {
    const { spots, spotAggregates, savedSpots, visitSummaries, selectedSpotId } = get();
    // 병합 규칙(필드 단위 병합 · 누적 상한 · 내 장소 보호)은 순수 함수로 분리해 테스트한다.
    const next = mergeSpotList(spots, newSpots, {
      savedSpotIds:   savedSpots.map(sv => sv.spot_id),
      visitedSpotIds: visitSummaries.map(v => v.spot_id),
      selectedSpotId,
    });
    set({
      spots: next,
      spotAggregates: newAggregates ? { ...spotAggregates, ...newAggregates } : spotAggregates,
    });
  },
  setCheckins: (checkins) => set({ checkins }),
  setSavedSpots: (savedSpots) => set({ savedSpots }),
  setVisitSummaries: (visitSummaries) => set({ visitSummaries }),
  setFamiliarSignals: (familiarSignals) => set({ familiarSignals }),

  isSaved: (spotId) => {
    const { savedSpots, dog } = get();
    if (!dog) return false;
    return savedSpots.some(s => s.spot_id === spotId && s.dog_id === dog.dog_id);
  },

  // ─── 장소 제안 ────────────────────────────────────────────────
  suggestSpot: ({ name, description, category, additional_tags, latitude, longitude, address_text, cover_image_url }, serverSpotId) => {
    const { dog, suggestedSpots, spots } = get();
    if (!dog) return '';
    const now = new Date().toISOString();
    const ts = Date.now();
    const newSuggestion: SuggestedSpot = {
      suggestion_id: `sug_${ts}`,
      name,
      description,
      category,
      additional_tags,
      latitude,
      longitude,
      suggested_by_dog_id: dog.dog_id,
      status: 'proposed',
      suggested_at: now,
    };
    // 임시 반영 — 로컬 spots 에도 넣어 제안 직후 카드·상세가 바로 뜨게 한다.
    //   spot_id는 서버가 발급한 uuid를 그대로 쓴다. 예전처럼 로컬에서 지어낸
    //   `spot_user_<ts>`를 쓰면 spots.spot_id(uuid)로 조회가 안 돼
    //   발도장·상세가 서버에서 100% 404가 난다.
    const tempSpot: Spot = {
      spot_id: serverSpotId ?? `spot_user_${ts}`,
      name,
      category,
      latitude,
      longitude,
      // 서버에는 넣고 로컬 임시본에만 빠지면, 방금 제안한 장소의 상세에서만
      // 주소 줄이 사라져 "왜 내 장소만 주소가 없지"가 된다(cover_image_url과 같은 함정).
      address_text,
      description,
      features: additional_tags,
      // 사진을 빼먹으면 방금 올린 사진을 두고도 카드가 일러스트로 뜬다.
      // 서버에는 저장되는데 로컬 임시 반영본에만 없어서 "왜 반영이 안 되지"가 된다.
      cover_image_url,
      status: 'active',
      created_source: 'user_suggested',
      created_at: now,
    };
    set({
      suggestedSpots: [...suggestedSpots, newSuggestion],
      spots: [...spots, tempSpot],
    });
    return tempSpot.spot_id;
  },

  getNearbyDuplicates: (lat, lng, name, category) => {
    const { spots } = get();
    const normalize = (s: string) => s.trim().toLowerCase();
    return spots
      // 검토 중인 장소도 대상이다. active만 보던 때는 남이 방금 올린 장소가 안 잡혀서
      // 같은 곳이 두 번 등록됐다 — 즉시 노출로 바꾸면서 눈에 띄게 됐다.
      .filter(s => s.status === 'active' || s.status === 'pending')
      .map(s => ({ spot: s, dist: haversineDistance(lat, lng, s.latitude, s.longitude) }))
      .filter(({ dist }) => dist <= 15)
      .map(({ spot, dist }) => ({
        spot_id: spot.spot_id,
        name: spot.name,
        category: spot.category,
        category_label: categoryLabel[spot.category],
        distance_m: Math.round(dist),
        is_hard_block:
          dist <= 10 &&
          normalize(spot.name) === normalize(name) &&
          spot.category === category,
      }));
  },

  // ─── Computed: Home Cards ───────────────────────────────────
  // 거리는 currentLocation 기반으로 실제 계산 (mock random 제거)
  getHomeCards: (opts) => {
    const { spots, spotAggregates, checkins, visitSummaries, dog, currentLocation, blockedUsers } = get();
    const includePending = opts?.includePending ?? false;
    // 강아지가 없어도 주변 장소 추천은 노출한다(개인화만 생략). 홈이 텅 비지 않도록.

    // 차단한 사용자/강아지의 발도장 제외
    const blockedDogIds = new Set(blockedUsers.map(b => b.blocked_dog_id).filter(Boolean) as string[]);
    const filteredCheckins = checkins.filter(c => !blockedDogIds.has(c.dog_id));

    // 성능: 스팟마다 visitSummaries.find(O(n)) 대신 dog별 방문요약을 spot_id Map으로 1회 인덱싱 → O(1) 조회
    const summaryBySpot = new Map<string, any>();
    if (dog) for (const vs of visitSummaries) {
      if (vs.dog_id === dog.dog_id) summaryBySpot.set(vs.spot_id, vs);
    }

    return spots
      .filter(s => s.status === 'active' || (includePending && s.status === 'pending'))
      .map(spot => {
        // 서버 집계(전체 강아지)가 있으면 우선 사용, 없으면(데모/오프라인) 로컬 checkins로 폴백
        const agg = serverAggregateToSpotAggregate(spot.spot_id, spotAggregates[spot.spot_id])
          ?? computeSpotAggregate(spot.spot_id, filteredCheckins);
        // 강아지가 있을 때만 방문 요약(개인화) 조회
        const summary = dog ? summaryBySpot.get(spot.spot_id) : undefined;
        // currentLocation이 있으면 실제 거리, 없으면 undefined (카드에서 "근처"로 표기)
        const distanceMeters = currentLocation
          ? haversineDistance(currentLocation.latitude, currentLocation.longitude, spot.latitude, spot.longitude)
          : undefined;
        return buildHomeSpotCard(
          spot, agg, summary, distanceMeters,
          spotAggregates[spot.spot_id]?.savedCount ?? 0,
          spotAggregates[spot.spot_id]?.savedByMe ?? false,
        );
      });
  },

  // ─── Computed: Spot Detail ───────────────────────────────────
  getSpotDetail: (spotId) => {
    const {
      spots, spotAggregates, checkins, visitSummaries, familiarSignals, dog,
      savedSpots, privacySetting, currentLocation, blockedUsers, dogs,
    } = get();
    const spot = spots.find(s => s.spot_id === spotId);
    // hidden/blocked/merged 장소는 상세 노출 차단 (어드민에서 비노출 처리한 장소 보호)
    // 강아지 미등록 사용자도 장소 탐색은 가능 — 개인화(방문/저장/익숙한 강아지)만 생략한다.
    if (!spot || spot.status !== 'active') return null;

    // 차단 적용
    const blockedDogIds = new Set(blockedUsers.map(b => b.blocked_dog_id).filter(Boolean) as string[]);
    const filteredCheckins = checkins.filter(c => !blockedDogIds.has(c.dog_id));

    const agg = serverAggregateToSpotAggregate(spotId, spotAggregates[spotId])
      ?? computeSpotAggregate(spotId, filteredCheckins);
    const summary = dog ? visitSummaries.find(s => s.dog_id === dog.dog_id && s.spot_id === spotId) : undefined;
    const isSaved = dog ? savedSpots.some(s => s.spot_id === spotId && s.dog_id === dog.dog_id) : false;

    const psMap = new Map(dog ? [[dog.dog_id, privacySetting]] : []);
    // DEV: 익숙한 강아지 정보 조회 — 실사용 시 서버에서 가져옴
    const allDogsForLookup = [...dogs, ...mockOtherDogs];
    const familiarDogs = dog
      ? buildFamiliarDogCards(spotId, familiarSignals, allDogsForLookup, dog.dog_id, psMap, filteredCheckins)
      : [];
    const traces = buildTraceList(spotId, filteredCheckins);

    const regularStatus = summary ? computeRegularStatus(summary) : 'none';

    // 거리: currentLocation 기반 — 없으면 표시 생략
    const distanceMeters = currentLocation
      ? haversineDistance(currentLocation.latitude, currentLocation.longitude, spot.latitude, spot.longitude)
      : null;
    // 서버 응답으로 만드는 상세(buildSpotDetailFromApi)와 같은 함수를 써야 한다 —
    // 로컬 폴백일 때만 거리 표기가 달라지면 원인을 찾기 어렵다.
    const distanceText = distanceTextOr(distanceMeters, '거리 정보 없음');

    // 시/도·구 수준 위치 요약 (주소에서 추출)
    const addr = spot.address_text || '';
    const addrParts = addr.split(' ');
    const sidoRaw = addrParts[0] ?? '';
    const sidoShort = sidoRaw === '서울특별시' ? '서울'
      : sidoRaw === '경기도' ? '경기'
      : sidoRaw.replace(/특별시|광역시|도$/, '');
    const sigunguRaw = addrParts[1] ?? (spot.neighborhood ?? '');
    const regionSummary = sigunguRaw ? `${sidoShort} ${sigunguRaw}` : sidoShort;

    return {
      spot_id: spotId,
      name: spot.name,
      category_label: categoryLabel[spot.category],
      subcategory: spot.subcategory,
      distance_text: distanceText,
      latitude: spot.latitude,
      longitude: spot.longitude,
      neighborhood: spot.neighborhood,
      region_summary: regionSummary || undefined,
      cover_image_url: spot.cover_image_url,
      is_saved: isSaved,
      atmosphere_summary: atmosphereLabel[agg.atmosphere_state],
      atmosphere_state: agg.atmosphere_state,
      recent_trace_count: agg.recent_trace_count,
      unique_visitor_count: agg.recent_unique_dog_count,
      // 로컬 폴백(데모·오프라인)에는 커뮤니티 누적 집계가 없다.
      // 0으로 두면 화면이 해당 지표를 숨기므로, 없는 숫자를 지어내지 않는다.
      total_checkin_count: agg.recent_trace_count,
      saved_count: 0,
      regular_dog_count: 0,
      first_checkin_at: null,
      facility_tags: spot.features ?? [],
      dominant_tags: agg.dominant_feeling_tags,
      // 로컬 폴백(데모·오프라인)엔 태그별 횟수가 없다 — 태그만 보이고 횟수는 감춘다
      tag_counts: agg.dominant_feeling_tags.map(tag => ({ tag, count: 0 })),
      description: spot.description,
      address_text: spot.address_text,
      opening_hours: spot.opening_hours,
      features: spot.features,
      caution: spot.caution,
      user_relation: summary
        ? {
            first_visit_text: visitDateText(summary.first_visit_at),
            visit_count: summary.visit_count,
            last_visit_text: relativeTime(summary.last_visit_at),
            regular_status_label: regularStatusLabel[regularStatus],
            regular_status: regularStatus,
          }
        : undefined,
      familiar_dogs: familiarDogs,
      recent_traces: traces,
    };
  },

  // ─── Computed: Dog Map Spots ───────────────────────────────────
  getDogMapSpots: () => {
    const { spots, visitSummaries, dog } = get();
    if (!dog) return [];

    const spotsById = new Map(spots.map(sp => [sp.spot_id, sp]));
    return visitSummaries
      .filter(s => s.dog_id === dog.dog_id)
      .map(s => {
        const spot = spotsById.get(s.spot_id);
        if (!spot) return null;
        return {
          spot_id: spot.spot_id,
          name: spot.name,
          latitude: spot.latitude,
          longitude: spot.longitude,
          visit_count: s.visit_count,
          pin_variant: computeDogMapPinVariant(s),
        } as DogMapSpotViewModel;
      })
      .filter(Boolean) as DogMapSpotViewModel[];
  },
});

export const useAppStore = DEV_PREVIEW_SEED
  ? create<AppState>(storeImpl as any)
  : create<AppState>()(
      persist(storeImpl as any, {
        name: 'dogear-v1',
        storage: createJSONStorage(() => AsyncStorage),
        /**
         * 저장본 버전.
         *
         * 데모(DEV_SEED) 빌드를 쓰던 기기에 실환경 빌드를 덮어 설치하면 AsyncStorage가 남아
         * 목 데이터(강아지 '보리'·'콩이'·'아몬드', 목 스팟)가 그대로 복원됐다.
         * 실제로 가입한 사용자에게 테스트 강아지가 보이던 원인.
         * 버전을 올리면 이전 저장본은 migrate에서 폐기된다.
         */
        version: 2,
        migrate: (persisted: any, from: number) => {
          // v2 미만은 목 데이터가 섞였을 수 있으므로 계정 관련 상태를 신뢰하지 않는다.
          //   서버에서 다시 불러오면 되는 값들이라 버려도 손실이 없다.
          if (from < 2) {
            return {
              hasCompletedOnboarding: persisted?.hasCompletedOnboarding ?? false,
              consent: persisted?.consent ?? null,
            };
          }
          return persisted;
        },
        partialize: (state: any) => ({
          isAuthenticated: state.isAuthenticated,
          hasCompletedOnboarding: state.hasCompletedOnboarding,
          pushEnabled: state.pushEnabled,
          consent: state.consent,
          user: state.user,
          dog: state.dog,
          activeDog: state.activeDog,
          dogs: state.dogs,
          privacySetting: state.privacySetting,
          // 성능: spots는 지도 세션 데이터(수백 개)로 앱 진입 시 useNearbySpots가 재fetch하므로 persist 제외.
          //   (persist하면 매 set()마다 수백 객체 JSON 직렬화 → 핀 탭·팬마다 비용. stale 표시 방지 효과도 있음)
          checkins: state.checkins,
          savedSpots: state.savedSpots,
          visitSummaries: state.visitSummaries,
          familiarSignals: state.familiarSignals,
          suggestedSpots: state.suggestedSpots,
          blockedUsers: state.blockedUsers,
          // ⚠️ currentLocation은 **persist하지 않는다.**
          //    저장하면 공원에서 잡힌 좌표가 앱을 껐다 켜도 남아, 집에서도 그 좌표로
          //    발도장이 찍혔다(거리 0m로 계산됨). 위치는 세션마다 새로 잡는다.
          lastUsedVisibility: state.lastUsedVisibility,
        }),
      })
    );

// ─── DEV ONLY: window에 store 노출 (preview/디버깅용) ────────────
// 프로덕션 빌드에서는 __DEV__가 false로 트리쉐이킹됨
if (typeof window !== 'undefined') {
  (window as any).__store = useAppStore;
}
