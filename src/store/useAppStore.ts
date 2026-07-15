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
import { notify } from '../utils/dialog';
import {
  computeSpotAggregate, buildHomeSpotCard, computeRegularStatus,
  buildFamiliarDogCards, buildTraceList, computeDogMapPinVariant,
} from '../utils/rules';
import { categoryLabel, atmosphereLabel, regularStatusLabel, visitDateText, relativeTime } from '../utils/labels';
import type { SpotDetailViewModel, DogMapSpotViewModel } from '../types';
import {
  mockUser, mockDog, mockDogs, mockSpots, mockCheckins, mockSavedSpots,
  mockVisitSummaries, mockFamiliarDogSignals, mockPrivacySetting,
  mockOtherDogs,
} from '../data/mockData';

// 목업 시드 — .env의 EXPO_PUBLIC_DEV_SEED=true 일 때만 활성화
// 프로덕션 빌드: .env.production에 EXPO_PUBLIC_DEV_SEED=false 설정
const DEV_PREVIEW_SEED = IS_DEV_SEED;

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
  privacySetting: PrivacySetting;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  isAuthLoading: boolean;
  pushEnabled: boolean;   // 푸시 알림 수신 설정 (사용자 토글, 기본 on)

  // 약관 동의 (앱스토어/법규 대응)
  consent: ConsentRecord | null;

  // Location
  currentLocation: { latitude: number; longitude: number; accuracy?: number } | null;

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
    photoUri?: string;
    visibility: VisibilityLevel;
  };
  /** 마지막으로 제출한 발도장의 공개 범위 — 다음 발도장의 기본값으로 사용 (persist) */
  lastUsedVisibility?: VisibilityLevel;
  /** 주변 스팟 페치 진행 중 (useNearbySpots가 set) — 홈/지도 스켈레톤 노출용. persist 안 함. */
  isSpotsLoading: boolean;
  setSpotsLoading: (loading: boolean) => void;

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
  setPawVisibility: (v: VisibilityLevel) => void;
  resetPawFlow: () => void;
  updatePrivacySetting: (updates: Partial<PrivacySetting>) => void;

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
  setCheckins: (checkins: PawCheckin[]) => void;
  setSavedSpots: (savedSpots: SavedSpot[]) => void;
  setVisitSummaries: (visitSummaries: SpotVisitSummary[]) => void;
  setFamiliarSignals: (signals: FamiliarDogSignal[]) => void;

  // Spot 제안 actions
  // 임시 반영: suggestedSpots 와 spots 양쪽에 모두 추가하여 제안 직후
  // 발도장 찍기 / 저장 등이 가능하도록 함. 새 spot_id를 반환.
  suggestSpot: (data: {
    name: string;
    description: string;
    category: SpotCategory;
    additional_tags: string[];
    latitude: number;
    longitude: number;
  }) => string;
  getNearbyDuplicates: (lat: number, lng: number, name: string, category: SpotCategory) => NearbyDuplicate[];

  // Computed helpers
  getSpotDetail: (spotId: string) => SpotDetailViewModel | null;
  getHomeCards: () => HomeSpotCardViewModel[];
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
    visibility: 'spot_only',
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
    suggestedSpots: [],
    lastUsedVisibility: undefined,
    pawFlow: { step: 1, selectedTags: [], note: '', visibility: 'spot_only' },
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
              notify('저장 해제에 실패했어요. 잠시 후 다시 시도해주세요.');
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
              notify('저장에 실패했어요. 잠시 후 다시 시도해주세요.');
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

  updatePrivacySetting: (updates) =>
    set(s => ({ privacySetting: { ...s.privacySetting, ...updates, updated_at: new Date().toISOString() } })),

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
        if (error || !data) return;  // 실패해도 로컬 차단은 유지(다음 로그인 시 서버와 재동기화)
        set(s => ({
          blockedUsers: s.blockedUsers.map(b =>
            b.block_id === tempId ? { ...b, block_id: data.block_id, blocked_at: data.created_at } : b),
        }));
      });
    }
  },

  unblockUser: (block_id) => {
    const { blockedUsers } = get();
    set({ blockedUsers: blockedUsers.filter(b => b.block_id !== block_id) });  // 낙관적
    if (IS_REAL_AUTH && !block_id.startsWith('blk_')) {
      supabase.from('blocks').delete().eq('block_id', block_id).then(() => {});
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
    setUserContext({ user_id: user?.user_id ?? null });
  },
  setActiveDog: (dog) => {
    set({ activeDog: dog, dog });
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

  deleteDog: async (dog_id) => {
    if (IS_REAL_AUTH) {
      const { error } = await supabase
        .from('dogs')
        .update({ deleted_at: new Date().toISOString() })
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
  setCurrentLocation: (currentLocation) => set({ currentLocation }),
  setPushEnabled: (pushEnabled) => set({ pushEnabled }),

  setSpots: (spots) => set({ spots }),
  setSpotAggregates: (spotAggregates) => set({ spotAggregates }),
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
  suggestSpot: ({ name, description, category, additional_tags, latitude, longitude }) => {
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
    // 임시 반영 — 실제 spots 에도 active 로 추가하여
    // 발도장 찍기/저장 등 후속 액션이 가능하도록 함
    const tempSpot: Spot = {
      spot_id: `spot_user_${ts}`,
      name,
      category,
      latitude,
      longitude,
      description,
      features: additional_tags,
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
      .filter(s => s.status === 'active')
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
  getHomeCards: () => {
    const { spots, spotAggregates, checkins, visitSummaries, dog, currentLocation, blockedUsers } = get();
    // 강아지가 없어도 주변 장소 추천은 노출한다(개인화만 생략). 홈이 텅 비지 않도록.

    // 차단한 사용자/강아지의 발도장 제외
    const blockedDogIds = new Set(blockedUsers.map(b => b.blocked_dog_id).filter(Boolean) as string[]);
    const filteredCheckins = checkins.filter(c => !blockedDogIds.has(c.dog_id));

    return spots
      .filter(s => s.status === 'active')
      .map(spot => {
        // 서버 집계(전체 강아지)가 있으면 우선 사용, 없으면(데모/오프라인) 로컬 checkins로 폴백
        const agg = serverAggregateToSpotAggregate(spot.spot_id, spotAggregates[spot.spot_id])
          ?? computeSpotAggregate(spot.spot_id, filteredCheckins);
        // 강아지가 있을 때만 방문 요약(개인화) 조회
        const summary = dog
          ? visitSummaries.find(s => s.dog_id === dog.dog_id && s.spot_id === spot.spot_id)
          : undefined;
        // currentLocation이 있으면 실제 거리, 없으면 undefined (카드에서 "근처"로 표기)
        const distanceMeters = currentLocation
          ? haversineDistance(currentLocation.latitude, currentLocation.longitude, spot.latitude, spot.longitude)
          : undefined;
        return buildHomeSpotCard(spot, agg, summary, distanceMeters);
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
    const distanceText =
      distanceMeters == null
        ? '거리 정보 없음'
        : distanceMeters < 100
        ? '바로 근처'
        : distanceMeters < 1000
        ? `${Math.round(distanceMeters / 10) * 10}m`
        : `${(distanceMeters / 1000).toFixed(1)}km`;

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
      dominant_tags: agg.dominant_feeling_tags,
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

    return visitSummaries
      .filter(s => s.dog_id === dog.dog_id)
      .map(s => {
        const spot = spots.find(sp => sp.spot_id === s.spot_id);
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
          spots: state.spots,
          checkins: state.checkins,
          savedSpots: state.savedSpots,
          visitSummaries: state.visitSummaries,
          familiarSignals: state.familiarSignals,
          suggestedSpots: state.suggestedSpots,
          blockedUsers: state.blockedUsers,
          currentLocation: state.currentLocation,
          lastUsedVisibility: state.lastUsedVisibility,
        }),
      })
    );

// ─── DEV ONLY: window에 store 노출 (preview/디버깅용) ────────────
// 프로덕션 빌드에서는 __DEV__가 false로 트리쉐이킹됨
if (typeof window !== 'undefined') {
  (window as any).__store = useAppStore;
}
