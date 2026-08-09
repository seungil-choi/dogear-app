import type {
  PawCheckin, SpotVisitSummary, FamiliarDogSignal, PrivacySetting,
  AtmosphereState, FeelingTag, RegularStatus, HomeSpotCardViewModel,
  Spot, Dog, DogSize, SpotDetailApiViewModel, SpotDetailViewModel,
} from '../types';
import { feelingTagLabel, atmosphereLabel, categoryLabel, relativeTime, sizeLabel, temperamentLabels, ageGroupLabel, regularStatusLabel, visitDateText } from './labels';
import type { FamiliarDogCardViewModel, TraceListItemViewModel, SpotAggregate } from '../types';
import { FAMILIAR_LAYER_POLICY } from '../config/familiar-layer';
import { haversineDistance } from './geo';
import { authoredDescription } from './spotDescription';

const HOURS_72 = 72 * 60 * 60 * 1000;
const DAYS_14 = 14 * 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
// familiar_layer 정책의 윈도 — SSOT에서 미러
const FAMILIAR_WINDOW_MS = FAMILIAR_LAYER_POLICY.WINDOW_DAYS * 24 * 60 * 60 * 1000;

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
  /** 서버 집계에만 있는 값 — 로컬 폴백(데모·오프라인)에는 없으므로 0 */
  savedCount = 0,
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
    category: spot.category,
    category_label: categoryLabel[spot.category],
    subcategory: spot.subcategory,
    distance_text: distanceMeters != null
      ? `${distanceMeters < 1000 ? Math.round(distanceMeters) + 'm' : (distanceMeters / 1000).toFixed(1) + 'km'}`
      : '근처',
    atmosphere_badges: badges.slice(0, 3),
    recent_trace_label: aggregate.recent_trace_count > 0 ? `최근 ${aggregate.recent_trace_count}건` : undefined,
    has_visited: !!summary,
    is_regular: regular_status === 'regular',
    cover_image_url: spot.cover_image_url,
    saved_count: savedCount,
    visit_count: summary?.visit_count,
    last_visit_text: summary ? relativeTime(summary.last_visit_at) : undefined,
    last_visit_at: summary?.last_visit_at,
  };
}

// ─── 자주 찾는 강아지 — 완화된 최근성 텍스트 ──────────────────
// 정확한 시간·횟수·패턴 절대 노출 금지 (개인정보보호 + 비소셜 원칙)
function softenedRecencyLabel(checkinCount: number, lastSeenAt: string): string {
  const diffDays = (Date.now() - new Date(lastSeenAt).getTime()) / 86_400_000;
  if (checkinCount >= 3 && diffDays <= 7) return '최근 자주 찾고 있어요';
  if (diffDays <= 7) return '최근 방문 기록이 있어요';
  return '이곳을 꾸준히 찾는 강아지예요';
}

function spotRelationText(checkinCount: number): string {
  if (checkinCount >= 4) return '최근 꾸준히 흔적을 남긴 강아지예요';
  if (checkinCount >= 2) return '이 장소에 익숙한 강아지예요';
  return '이곳을 자주 찾는 강아지예요';
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
  // currentDog(보고 있는 사용자) 자신의 노출 허용도 양방 합의 원칙으로 체크
  const currentDogPs = privacySettings.get(currentDogId);
  const currentDogAllowed = !currentDogPs || currentDogPs.allow_familiar_layer_exposure;
  if (!currentDogAllowed) {
    // 본인 강아지가 노출 거부 상태면 양방 매칭이 성립 불가 → 카드 비활성
    return [];
  }

  const eligible = signals
    .filter(s => {
      if (s.spot_id !== spotId) return false;
      if (s.visible_dog_id === currentDogId) return false;
      if (!s.exposure_allowed) return false;
      // 상대(visible_dog) 노출 허용 — 기본 동의로 간주(설정 없으면 허용)
      const ps = privacySettings.get(s.visible_dog_id);
      if (ps && !ps.allow_familiar_layer_exposure) return false;
      const recentFamiliarCheckins = allCheckins.filter(
        c => c.spot_id === spotId
          && c.dog_id === s.visible_dog_id
          && c.visibility_level === 'familiar_layer'
          && isWithin(c.checked_in_at, FAMILIAR_WINDOW_MS)
          && isValid(c),
      );
      return (
        recentFamiliarCheckins.length >= FAMILIAR_LAYER_POLICY.MIN_FAMILIAR_CHECKIN_COUNT
        && isWithin(s.recent_last_seen_at, FAMILIAR_WINDOW_MS)
      );
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
      breed_text: dog?.breed ?? '',
      size_label: dog ? sizeLabel[dog.size] : '',
      breed_age_text: breedAgeText,
      temperament_preview: (dog?.temperament_tags ?? []).slice(0, 2).map(t => temperamentLabels[t] ?? t),
      recency_label: softenedRecencyLabel(s.recent_visible_checkin_count, s.recent_last_seen_at),
      relation_text: spotRelationText(s.recent_visible_checkin_count),
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

// ─── 방문한 장소 지도 핀 variant (내 강아지의 스팟) ─────────────────────────────
export function computeDogMapPinVariant(
  summary: SpotVisitSummary,
): 'visited' | 'regular' | 'recent' {
  const status = computeRegularStatus(summary);
  if (status === 'regular') return 'regular';
  if (isWithin(summary.last_visit_at, DAYS_7)) return 'recent';
  return 'visited';
}

// ─── 서버 상세(spot-detail) → 화면 뷰모델 어댑터 ─────────────
// 서버가 전체 강아지 기준으로 계산한 분위기/흔적/익숙한 강아지를 화면용 VM으로 변환.
// 익숙한 강아지의 정확한 시간·횟수는 절대 노출하지 않고 기존 완화 로직(softenedRecencyLabel/spotRelationText) 재사용.
// 거리·지역은 클라이언트(현재 위치)에서 계산, 정적 정보(설명/시설/주의)는 store spot에서 병합.
export function buildSpotDetailFromApi(
  api: SpotDetailApiViewModel,
  ctx: { currentLocation: { latitude: number; longitude: number } | null; storeSpot?: Spot },
): SpotDetailViewModel {
  const spot = api.spot;

  const distanceMeters = ctx.currentLocation
    ? haversineDistance(ctx.currentLocation.latitude, ctx.currentLocation.longitude, spot.latitude, spot.longitude)
    : null;
  const distance_text =
    distanceMeters == null ? '거리 정보 없음'
    : distanceMeters < 100 ? '바로 근처'
    : distanceMeters < 1000 ? `${Math.round(distanceMeters / 10) * 10}m`
    : `${(distanceMeters / 1000).toFixed(1)}km`;

  const addrParts = (spot.address_text || '').split(' ');
  const sidoRaw = addrParts[0] ?? '';
  const sidoShort = sidoRaw === '서울특별시' ? '서울'
    : sidoRaw === '경기도' ? '경기'
    : sidoRaw.replace(/특별시|광역시|도$/, '');
  const sigunguRaw = addrParts[1] ?? (spot.neighborhood ?? '');
  const regionSummary = sigunguRaw ? `${sidoShort} ${sigunguRaw}` : sidoShort;

  const familiar_dogs: FamiliarDogCardViewModel[] = api.familiar_dogs.map(d => {
    const sizeLbl = sizeLabel[d.size as DogSize] ?? '';
    return {
      dog_id: d.dog_id,
      name: d.name || '강아지',
      avatar_url: d.avatar_url ?? undefined,
      breed_text: '',
      size_label: sizeLbl,
      breed_age_text: sizeLbl,
      temperament_preview: (d.temperament_tags ?? []).slice(0, 2).map(t => temperamentLabels[t] ?? t),
      recency_label: softenedRecencyLabel(d.recent_checkin_count, d.last_seen_at),
      relation_text: spotRelationText(d.recent_checkin_count),
    };
  });

  const recent_traces: TraceListItemViewModel[] = api.recent_traces.map(c => ({
    trace_id: c.checkin_id,
    relative_time_text: relativeTime(c.checked_in_at),
    primary_tag_label: c.feeling_tags[0] ? feelingTagLabel[c.feeling_tags[0]] : '',
    secondary_text: c.note ?? (c.feeling_tags[1] ? feelingTagLabel[c.feeling_tags[1]] : undefined),
    has_photo: !!c.photo_url,
    photo_count: c.photo_url ? 1 : 0,
  }));

  const ur = api.user_relation;
  const user_relation = ur && ur.visit_count > 0
    ? {
        first_visit_text: ur.first_visit_at ? visitDateText(ur.first_visit_at) : '',
        visit_count: ur.visit_count,
        last_visit_text: ur.last_visit_at ? relativeTime(ur.last_visit_at) : '',
        regular_status_label: regularStatusLabel[ur.regular_status],
        regular_status: ur.regular_status,
      }
    : undefined;

  return {
    spot_id: spot.spot_id,
    name: spot.name,
    category_label: categoryLabel[spot.category],
    subcategory: spot.subcategory ?? ctx.storeSpot?.subcategory,
    distance_text,
    latitude: spot.latitude,
    longitude: spot.longitude,
    neighborhood: spot.neighborhood ?? undefined,
    region_summary: regionSummary || undefined,
    cover_image_url: spot.cover_image_url ?? undefined,
    is_saved: !!(ur && ur.saved_type),
    atmosphere_summary: atmosphereLabel[api.atmosphere.state],
    atmosphere_state: api.atmosphere.state,
    recent_trace_count: api.atmosphere.recent_checkin_count,
    // 예전에는 여기에 recent_checkin_count를 그대로 넣어, 화면의 "방문한 강아지"와
    // "최근 발도장"이 항상 같은 숫자로 보였다. 이제 서버가 distinct 집계를 내려준다.
    unique_visitor_count: api.community?.unique_dog_count ?? 0,
    total_checkin_count:  api.atmosphere.total_checkin_count ?? 0,
    saved_count:          api.community?.saved_count ?? 0,
    regular_dog_count:    api.community?.regular_dog_count ?? 0,
    first_checkin_at:     api.community?.first_checkin_at ?? null,
    is_pending_review:    !!spot.is_pending_review,
    facility_tags:        spot.facility_tags ?? [],
    dominant_tags: api.atmosphere.top_feeling_tags,
    user_relation,
    familiar_dogs,
    recent_traces,
    // 서버 상세 응답엔 없는 정적 정보는 store spot에서 병합 (있으면)
    address_text: spot.address_text ?? ctx.storeSpot?.address_text,
    opening_hours: ctx.storeSpot?.opening_hours,
    features: ctx.storeSpot?.features,
    // 설명은 "사람이 쓴 것"만 노출한다. 원천 데이터의 설명은 카테고리·시설의
    // 기계적 재서술이라, 그대로 두면 화면에 같은 정보가 두 번 나온다.
    // (서버도 부분 필터를 하지만 판정 규칙의 기준은 authoredDescription 한 곳이다)
    description: authoredDescription(
      spot.description ?? ctx.storeSpot?.description,
      spot.subcategory ?? ctx.storeSpot?.subcategory,
    ),
    caution: ctx.storeSpot?.caution,
  };
}
