import type {
  PawCheckin, SpotVisitSummary, FamiliarDogSignal, PrivacySetting,
  AtmosphereState, FeelingTag, RegularStatus, PinVariant, HomeSpotCardViewModel,
  MapPinViewModel, Spot, Dog,
} from '../types';
import { feelingTagLabel, atmosphereLabel, categoryLabel, relativeTime, sizeLabel, temperamentLabels, ageGroupLabel } from './labels';
import type { FamiliarDogCardViewModel, TraceListItemViewModel, SpotAggregate } from '../types';

const HOURS_72 = 72 * 60 * 60 * 1000;
const DAYS_14 = 14 * 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

// ─── 유효 발도장 필터 ─────────────────────────────
function isValid(c: PawCheckin) {
  return c.is_valid_for_aggregate && !!c.spot_id && !!c.checked_in_at && !!c.dog_id;
}

// ─── 공개 집계 가능한 발도장 ─────────────────────────────
function isPublicAggregate(c: PawCheckin) {
  return isValid(c) && (c.visibility_level === 'spot_only' || c.visibility_level === 'familiar_layer');
}

// ─── 최근 N밀리초 이내 ─────────────────────────────
function isWithin(isoStr: string, ms: number) {
  return Date.now() - new Date(isoStr).getTime() < ms;
}

// ─── 단골 상태 계산 ─────────────────────────────
export function computeRegularStatus(summary: SpotVisitSummary): RegularStatus {
  const { last_30d_visit_count, visit_count, last_visit_at } = summary;
  if (last_30d_visit_count >= 3) return 'regular';
  if (visit_count >= 5 && isWithin(last_visit_at, DAYS_14)) return 'regular';
  if (last_30d_visit_count >= 2) return 'candidate';
  return 'none';
}

// ─── 장소 집계 계산 ─────────────────────────────
export function computeSpotAggregate(
  spotId: string,
  allCheckins: PawCheckin[],
): SpotAggregate {
  const recent = allCheckins.filter(
    c => c.spot_id === spotId && isPublicAggregate(c) && isWithin(c.checked_in_at, HOURS_72),
  );

  const tagCounts: Partial<Record<FeelingTag, number>> = {};
  recent.forEach(c => {
    c.feeling_tags.forEach(t => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; });
  });

  const tagOrder: FeelingTag[] = ['quiet', 'good', 'many_dogs', 'come_back_again', 'good_for_short_rest', 'noisy'];
  const dominant = Object.entries(tagCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return tagOrder.indexOf(a[0] as FeelingTag) - tagOrder.indexOf(b[0] as FeelingTag);
    })
    .slice(0, 2)
    .map(([t]) => t as FeelingTag);

  const uniqueDogs = new Set(recent.map(c => c.dog_id)).size;

  let atmosphereState: AtmosphereState = 'unknown';
  if (recent.length > 0) {
    const manyDogRatio = (tagCounts['many_dogs'] ?? 0) / recent.length;
    const quietRatio = (tagCounts['quiet'] ?? 0) / recent.length;
    if (recent.length >= 4 && manyDogRatio > 0.3) atmosphereState = 'active';
    else if (quietRatio > 0.4) atmosphereState = 'quiet';
    else atmosphereState = 'mixed';
  }

  return {
    spot_id: spotId,
    recent_trace_count: recent.length,
    recent_unique_dog_count: uniqueDogs,
    dominant_feeling_tags: dominant,
    atmosphere_state: atmosphereState,
  };
}

// ─── 홈 카드 ViewModel 생성 ─────────────────────────────
export function buildHomeSpotCard(
  spot: Spot,
  aggregate: SpotAggregate,
  summary?: SpotVisitSummary,
  distanceMeters?: number,
): HomeSpotCardViewModel {
  const regular_status = summary ? computeRegularStatus(summary) : 'none';
  const badges: string[] = [];
  if (aggregate.atmosphere_state !== 'unknown')
    badges.push(atmosphereLabel[aggregate.atmosphere_state]);
  if (aggregate.recent_trace_count > 0)
    badges.push('최근 흔적 있음');
  if (regular_status === 'regular') badges.push('단골 스팟');
  if (summary && regular_status === 'candidate') badges.push('자주 찾는 스팟');

  return {
    spot_id: spot.spot_id,
    name: spot.name,
    category_label: categoryLabel[spot.category],
    distance_text: distanceMeters != null
      ? `${distanceMeters < 1000 ? Math.round(distanceMeters) + 'm' : (distanceMeters / 1000).toFixed(1) + 'km'}`
      : '근처',
    atmosphere_badges: badges.slice(0, 3),
    recent_trace_label: aggregate.recent_trace_count > 0 ? `최근 ${aggregate.recent_trace_count}건` : undefined,
    has_visited: !!summary,
    is_regular: regular_status === 'regular',
    cover_image_url: spot.cover_image_url,
    visit_count: summary?.visit_count,
    last_visit_text: summary ? relativeTime(summary.last_visit_at) : undefined,
    last_visit_at: summary?.last_visit_at,
  };
}

// ─── 지도 핀 variant ─────────────────────────────
export function computePinVariant(
  spot: Spot,
  aggregate: SpotAggregate,
  summary?: SpotVisitSummary,
): PinVariant {
  if (summary && computeRegularStatus(summary) === 'regular') return 'regular';
  if (summary) return 'visited';
  if (aggregate.recent_trace_count > 0) return 'recent_trace';
  return 'default';
}

// ─── 익숙한 강아지 카드 ─────────────────────────────
export function buildFamiliarDogCards(
  spotId: string,
  signals: FamiliarDogSignal[],
  dogs: Pick<Dog, 'dog_id' | 'name' | 'size' | 'age_group' | 'breed' | 'temperament_tags' | 'avatar_url'>[],
  currentDogId: string,
  privacySettings: Map<string, PrivacySetting>,
  allCheckins: PawCheckin[],
): FamiliarDogCardViewModel[] {
  const eligible = signals
    .filter(s => {
      if (s.spot_id !== spotId) return false;
      if (s.visible_dog_id === currentDogId) return false;
      if (!s.exposure_allowed) return false;
      const ps = privacySettings.get(s.visible_dog_id);
      if (ps && !ps.allow_familiar_layer_exposure) return false;
      const recentFamiliarCheckins = allCheckins.filter(
        c => c.spot_id === spotId
          && c.dog_id === s.visible_dog_id
          && c.visibility_level === 'familiar_layer'
          && isWithin(c.checked_in_at, DAYS_14)
          && isValid(c),
      );
      return recentFamiliarCheckins.length >= 2 && isWithin(s.recent_last_seen_at, DAYS_14);
    })
    .sort((a, b) => b.recent_visible_checkin_count - a.recent_visible_checkin_count)
    .slice(0, 6);

  return eligible.map(s => {
    const dog = dogs.find(d => d.dog_id === s.visible_dog_id);
    const breedAgeText = dog
      ? (dog.breed ? `${dog.breed} · ${ageGroupLabel[dog.age_group]}` : `${sizeLabel[dog.size]} · ${ageGroupLabel[dog.age_group]}`)
      : '';
    return {
      dog_id: s.visible_dog_id,
      name: dog?.name ?? '강아지',
      avatar_url: dog?.avatar_url,
      size_label: dog ? sizeLabel[dog.size] : '',
      breed_age_text: breedAgeText,
      temperament_preview: (dog?.temperament_tags ?? []).slice(0, 2).map(t => temperamentLabels[t] ?? t),
      last_seen_text: relativeTime(s.recent_last_seen_at),
    };
  });
}

// ─── 최근 흔적 리스트 ─────────────────────────────
export function buildTraceList(
  spotId: string,
  allCheckins: PawCheckin[],
): TraceListItemViewModel[] {
  return allCheckins
    .filter(c => c.spot_id === spotId && isPublicAggregate(c) && isWithin(c.checked_in_at, HOURS_72))
    .sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime())
    .slice(0, 5)
    .map(c => ({
      trace_id: c.checkin_id,
      relative_time_text: relativeTime(c.checked_in_at),
      primary_tag_label: c.feeling_tags[0] ? feelingTagLabel[c.feeling_tags[0]] : '',
      secondary_text: c.note ?? (c.feeling_tags[1] ? feelingTagLabel[c.feeling_tags[1]] : undefined),
      has_photo: !!c.photo_url,
      photo_count: c.photo_url ? 1 : 0,
    }));
}

// ─── 홈 추천 스팟 순위 ─────────────────────────────
export function sortHomeSpots(
  items: { card: HomeSpotCardViewModel; summary?: SpotVisitSummary; aggregate: SpotAggregate; distanceMeters: number }[],
): HomeSpotCardViewModel[] {
  return items
    .sort((a, b) => {
      const aReg = a.summary ? computeRegularStatus(a.summary) : 'none';
      const bReg = b.summary ? computeRegularStatus(b.summary) : 'none';
      const regScore = { regular: 2, candidate: 1, none: 0 };
      if (regScore[bReg] !== regScore[aReg]) return regScore[bReg] - regScore[aReg];
      if (b.aggregate.recent_trace_count !== a.aggregate.recent_trace_count)
        return b.aggregate.recent_trace_count - a.aggregate.recent_trace_count;
      return a.distanceMeters - b.distanceMeters;
    })
    .map(i => i.card);
}

// ─── 방문한 장소 지도 핀 variant (내 강아지의 스팟) ─────────────────────────────
export function computeDogMapPinVariant(
  summary: SpotVisitSummary,
): 'visited' | 'regular' | 'recent' {
  const status = computeRegularStatus(summary);
  if (status === 'regular') return 'regular';
  if (isWithin(summary.last_visit_at, DAYS_7)) return 'recent';
  return 'visited';
}
