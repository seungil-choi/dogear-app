/**
 * spots-nearby Edge Function
 *
 * 현재 위치 기준 반경 내 스팟 목록을 PostGIS로 조회한다.
 * Request body: { latitude, longitude, radiusMeters?, dogId? }
 * Response: { spots: SpotCard[], truncated: boolean }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const DEFAULT_RADIUS_M = 2000;
const MAX_RADIUS_M = 10000;
const MAX_RESULTS = 150;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // 웜업 핑 — pg_cron이 5분마다 x-warmup 헤더로 부른다. 여기서 바로 끝내
  // 인스턴스만 데운다(DB·body 파싱 없음). 콜드스타트 2~3s를 피하려는 것.
  if (req.headers.get('x-warmup')) {
    return Response.json({ ok: true, warm: true }, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 커뮤니티 집계는 RLS 우회 service-role로 읽는다(공개 spot_only만 노출).
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { latitude, longitude, radiusMeters = DEFAULT_RADIUS_M, dogId } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json(
        { error: 'latitude, longitude are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const radius = Math.min(radiusMeters, MAX_RADIUS_M);

    // 두 조회는 서로 의존하지 않으므로 병렬로 던진다. 예전엔 순차 await라
    // 매 호출 왕복이 2번 직렬로 쌓였다(콜드에선 이 차이가 더 크게 보인다).
    //   ① get_spots_nearby: 주변 활성 장소 (service_role 전용, 쿼터는 RPC 안)
    //   ② 내가 제안한 '검토 대기(hidden)' 장소 — active만 보는 ①에는 안 잡힌다.
    //      제안 직후 50m 움직여 목록이 서버본으로 교체되면 사라지던 것 보완.
    //      사용자 JWT로 조회하므로 남의 hidden은 RLS가 막는다.
    const [spotsRes, mineRes] = await Promise.all([
      svc.rpc('get_spots_nearby', {
        p_lat: latitude, p_lng: longitude, p_radius_m: radius, p_limit: MAX_RESULTS,
      }),
      supabase
        .from('spots')
        .select('spot_id, name, category, subcategory, latitude, longitude, address_text, neighborhood, cover_image_url, description, tags')
        .eq('status', 'hidden')
        .eq('created_source', 'user_suggested'),
    ]);

    const { data: spots, error: spotsError } = spotsRes;
    if (spotsError) {
      console.error('spots_nearby rpc error:', spotsError);
      return Response.json({ error: 'Failed to fetch spots' }, { status: 500, headers: corsHeaders });
    }

    // 조기 반환 금지: 주변에 활성 장소가 없어도 내 검토대기 장소는 병합 후 판단한다.
    const nearbySpots: any[] = spots ?? [];
    const mine = mineRes.data;

    const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
    const distanceM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
      const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    const seen = new Set(nearbySpots.map((s: any) => s.spot_id));
    for (const m of mine ?? []) {
      if (seen.has(m.spot_id)) continue;
      const d = distanceM(latitude, longitude, m.latitude, m.longitude);
      if (d > radius) continue;
      nearbySpots.push({ ...m, distance_m: d });
    }
    nearbySpots.sort((a: any, b: any) => a.distance_m - b.distance_m);

    if (nearbySpots.length === 0) {
      return Response.json({ spots: [], truncated: false }, { headers: corsHeaders });
    }

    const spotIds: string[] = nearbySpots.map((s: any) => s.spot_id);

    // 성능: spotIds에만 의존하는 독립 쿼리를 병렬로 (직렬 왕복 → 1웨이브).
    const [summariesRes, savedRes, statsRes] = await Promise.all([
      dogId
        ? supabase.from('spot_visit_summaries')
            .select('spot_id, visit_count, last_visit_at, regular_status')
            .eq('dog_id', dogId).in('spot_id', spotIds)
        : Promise.resolve({ data: null }),
      dogId
        ? supabase.from('saved_spots')
            .select('spot_id, saved_type')
            .eq('dog_id', dogId).in('spot_id', spotIds)
        : Promise.resolve({ data: null }),
      svc.rpc('spot_list_stats', { p_spot_ids: spotIds, p_recent_hours: 48 }),
    ]);

    const visitSummariesMap: Record<string, any> = {};
    (summariesRes.data ?? []).forEach((s: any) => { visitSummariesMap[s.spot_id] = s; });

    const savedMap: Record<string, string> = {};
    (savedRes.data ?? []).forEach((s: any) => { savedMap[s.spot_id] = s.saved_type; });

    const atmosphereMap: Record<string, string[]> = {};
    const checkinCountMap: Record<string, number> = {};
    const savedCountMap: Record<string, number> = {};
    for (const row of (statsRes.data ?? []) as any[]) {
      checkinCountMap[row.spot_id] = row.checkin_count ?? 0;
      atmosphereMap[row.spot_id] = row.recent_tags ?? [];
      savedCountMap[row.spot_id] = row.saved_count ?? 0;
    }

    // 기본값인 필드는 응답에서 뺀다. 앱은 모든 필드를 `?? 기본값`으로 읽으므로 동작이 같다.
    //   실측: 응답의 40%가 값이 전부 비어 있는 필드의 키 이름이었다.
    // spot_id·name·category·위경도·distance_m은 절대 빼지 않는다.
    const omitEmpty = (o: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        out[k] = v;
      }
      return out;
    };

    const result = nearbySpots.map((spot: any) => {
      const summary = visitSummariesMap[spot.spot_id];
      const topTags = getTopTags(atmosphereMap[spot.spot_id] ?? []);
      const atmosphere = deriveAtmosphereState(topTags);
      const checkinCount = checkinCountMap[spot.spot_id] ?? 0;
      const savedCount = savedCountMap[spot.spot_id] ?? 0;
      const visitCount = summary?.visit_count ?? 0;
      const regular = summary?.regular_status ?? 'none';

      return {
        spot_id: spot.spot_id,
        name: spot.name,
        category: spot.category,
        latitude: spot.latitude,
        longitude: spot.longitude,
        distance_m: Math.round(spot.distance_m),
        ...omitEmpty({
          subcategory: spot.subcategory,
          address_text: spot.address_text,
          neighborhood: spot.neighborhood,
          cover_image_url: spot.cover_image_url,
          description: spot.description,
          facility_tags: Array.isArray(spot.tags) ? spot.tags : [],
          top_feeling_tags: topTags,
          last_visit_at: summary?.last_visit_at,
          saved_type: savedMap[spot.spot_id],
          atmosphere_state: atmosphere === 'unknown' ? null : atmosphere,
          regular_status: regular === 'none' ? null : regular,
          checkin_count: checkinCount || null,
          user_visit_count: visitCount || null,
          saved_count: savedCount || null,
        }),
      };
    });

    return Response.json(
      { spots: result, truncated: result.length >= MAX_RESULTS },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error('spots-nearby error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

/** 태그 빈도 집계 → 상위 3개 반환 */
function getTopTags(tags: string[]): string[] {
  const freq: Record<string, number> = {};
  for (const tag of tags) {
    freq[tag] = (freq[tag] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

/** 태그에서 분위기 상태 파생 */
function deriveAtmosphereState(tags: string[]): string {
  if (tags.length === 0) return 'unknown';
  const hasQuiet = tags.includes('quiet');
  const hasActive = tags.includes('many_dogs') || tags.includes('noisy');
  if (hasQuiet && !hasActive) return 'quiet';
  if (hasActive && !hasQuiet) return 'active';
  if (hasQuiet && hasActive) return 'mixed';
  return 'unknown';
}
