import { create } from 'zustand';
import type {
  User, Dog, Spot, PawCheckin, SavedSpot, SpotVisitSummary,
  FamiliarDogSignal, PrivacySetting, VisibilityLevel, FeelingTag,
  HomeSpotCardViewModel,
} from '../types';
import {
  mockUser, mockDog, mockSpots, mockCheckins, mockSavedSpots,
  mockVisitSummaries, mockFamiliarDogSignals, mockPrivacySetting, mockOtherDogs,
} from '../data/mockData';
import {
  computeSpotAggregate, buildHomeSpotCard, computeRegularStatus,
  buildFamiliarDogCards, buildTraceList, computePinVariant, computeDogMapPinVariant,
} from '../utils/rules';
import { categoryLabel, atmosphereLabel, regularStatusLabel, visitDateText, relativeTime } from '../utils/labels';
import type { SpotDetailViewModel, DogMapSpotViewModel } from '../types';

interface AppState {
  // Auth
  user: User | null;
  dog: Dog | null;
  privacySetting: PrivacySetting;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;

  // Data
  spots: Spot[];
  checkins: PawCheckin[];
  savedSpots: SavedSpot[];
  visitSummaries: SpotVisitSummary[];
  familiarSignals: FamiliarDogSignal[];

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

  // Actions
  completeOnboarding: () => void;
  login: () => void;
  logout: () => void;
  selectSpot: (spotId: string | null) => void;
  toggleSaveSpot: (spotId: string) => void;
  submitPawCheckin: () => void;
  setPawStep: (step: number) => void;
  setPawSpot: (spot: HomeSpotCardViewModel) => void;
  setPawTags: (tags: FeelingTag[]) => void;
  setPawNote: (note: string) => void;
  setPawPhoto: (uri?: string) => void;
  setPawVisibility: (v: VisibilityLevel) => void;
  resetPawFlow: () => void;
  updatePrivacySetting: (updates: Partial<PrivacySetting>) => void;

  // Computed helpers
  getSpotDetail: (spotId: string) => SpotDetailViewModel | null;
  getHomeCards: () => HomeSpotCardViewModel[];
  getDogMapSpots: () => DogMapSpotViewModel[];
  isSaved: (spotId: string) => boolean;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ─── Initial State ───────────────────────────────────
  user: mockUser,
  dog: mockDog,
  privacySetting: mockPrivacySetting,
  isAuthenticated: false,
  hasCompletedOnboarding: false,

  spots: mockSpots,
  checkins: mockCheckins,
  savedSpots: mockSavedSpots,
  visitSummaries: mockVisitSummaries,
  familiarSignals: mockFamiliarDogSignals,

  selectedSpotId: null,

  pawFlow: {
    step: 1,
    selectedTags: [],
    note: '',
    visibility: 'spot_only',
  },

  // ─── Actions ───────────────────────────────────
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false }),

  selectSpot: (spotId) => set({ selectedSpotId: spotId }),

  toggleSaveSpot: (spotId) => {
    const { savedSpots, dog } = get();
    if (!dog) return;
    const existing = savedSpots.find(s => s.spot_id === spotId && s.dog_id === dog.dog_id);
    if (existing) {
      set({ savedSpots: savedSpots.filter(s => s.saved_spot_id !== existing.saved_spot_id) });
    } else {
      const newSaved: SavedSpot = {
        saved_spot_id: `sav_${Date.now()}`,
        dog_id: dog.dog_id,
        spot_id: spotId,
        saved_type: 'want_to_go',
        saved_at: new Date().toISOString(),
      };
      set({ savedSpots: [...savedSpots, newSaved] });
    }
  },

  submitPawCheckin: () => {
    const { pawFlow, dog, checkins, visitSummaries } = get();
    if (!dog || !pawFlow.selectedSpot) return;

    const newCheckin: PawCheckin = {
      checkin_id: `chk_${Date.now()}`,
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
    let newSummaries: SpotVisitSummary[];
    if (existing) {
      newSummaries = visitSummaries.map(s =>
        s.summary_id === existing.summary_id
          ? {
              ...s,
              last_visit_at: now,
              visit_count: s.visit_count + 1,
              last_30d_visit_count: s.last_30d_visit_count + 1,
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
          first_visit_at: now,
          last_visit_at: now,
          visit_count: 1,
          last_30d_visit_count: 1,
          regular_status: 'none' as const,
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
      pawFlow: { step: 1, selectedTags: [], note: '', visibility: s.privacySetting.default_visibility_level },
    })),

  updatePrivacySetting: (updates) =>
    set(s => ({ privacySetting: { ...s.privacySetting, ...updates, updated_at: new Date().toISOString() } })),

  isSaved: (spotId) => {
    const { savedSpots, dog } = get();
    if (!dog) return false;
    return savedSpots.some(s => s.spot_id === spotId && s.dog_id === dog.dog_id);
  },

  // ─── Computed: Home Cards ───────────────────────────────────
  getHomeCards: () => {
    const { spots, checkins, visitSummaries, dog } = get();
    if (!dog) return [];

    return spots
      .filter(s => s.status === 'active')
      .map(spot => {
        const agg = computeSpotAggregate(spot.spot_id, checkins);
        const summary = visitSummaries.find(s => s.dog_id === dog.dog_id && s.spot_id === spot.spot_id);
        const distanceMeters = Math.random() * 2000 + 100; // mock 거리
        return buildHomeSpotCard(spot, agg, summary, distanceMeters);
      });
  },

  // ─── Computed: Spot Detail ───────────────────────────────────
  getSpotDetail: (spotId) => {
    const { spots, checkins, visitSummaries, familiarSignals, dog, savedSpots, privacySetting } = get();
    const spot = spots.find(s => s.spot_id === spotId);
    if (!spot || !dog) return null;

    const agg = computeSpotAggregate(spotId, checkins);
    const summary = visitSummaries.find(s => s.dog_id === dog.dog_id && s.spot_id === spotId);
    const isSaved = savedSpots.some(s => s.spot_id === spotId && s.dog_id === dog.dog_id);

    const psMap = new Map([[dog.dog_id, privacySetting]]);
    const familiarDogs = buildFamiliarDogCards(spotId, familiarSignals, mockOtherDogs, dog.dog_id, psMap, checkins);
    const traces = buildTraceList(spotId, checkins);

    const regularStatus = summary ? computeRegularStatus(summary) : 'none';

    return {
      spot_id: spotId,
      name: spot.name,
      category_label: categoryLabel[spot.category],
      distance_text: '도보 8분',
      cover_image_url: spot.cover_image_url,
      is_saved: isSaved,
      atmosphere_summary: atmosphereLabel[agg.atmosphere_state],
      atmosphere_state: agg.atmosphere_state,
      recent_trace_count: agg.recent_trace_count,
      dominant_tags: agg.dominant_feeling_tags,
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
}));
