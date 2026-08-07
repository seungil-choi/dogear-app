/**
 * spots-nearby Edge Function
 *
 * 현재 위치 기준 반경 내 스팟 목록을 PostGIS로 조회한다.
 * Request body: { latitude, longitude, radiusMeters?, dogId? }
 * Response: SpotCard 뷰모델 배열 (거리 포함)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const DEFAULT_RADIUS_M = 2000;
const MAX_RADIUS_M = 10000;
const MAX_RESULTS = 150;   // 넓은 반경(지도 팬/줌아웃)에서 핀 밀도 확보

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 인증 확인
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 커뮤니티 집계(타 사용자 체크인)는 RLS 우회 service-role로 읽는다.
    //   - 사용자 JWT 클라이언트로 읽으면 RLS(checkins_own) 때문에 본인 체크인만 반환되어
    //     분위기/체크인 수 집계가 죽는다.
    //   - 노출은 공개(spot_only)로 한정해 familiar_layer/private 프라이버시를 보호.
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 인증은 플랫폼의 verify_jwt(활성)가 이미 강제한다.
    //   과거에는 여기서 auth.getUser()를 호출했는데, 반환값을 null 체크에만 쓰면서
    //   지도 팬마다 GoTrue 왕복이 한 번씩 더 붙어 체감 지연의 원인이 됐다.
    //   개인화 데이터(방문요약·저장)는 사용자 JWT 클라이언트로 조회하므로 RLS가 그대로 적용되고,
    //   스팟 자체는 공개 데이터라 추가 신원확인이 필요하지 않다.

    const body = await req.json();
    const {
      latitude,
      longitude,
      radiusMeters = DEFAULT_RADIUS_M,
      dogId,
    } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json(
        { error: 'latitude, longitude are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const radius = Math.min(radiusMeters, MAX_RADIUS_M);

    // PostGIS 쿼리: 반경 내 활성 스팟 + 거리 계산
    // SEC-03: get_spots_nearby는 service_role 전용(authenticated 회수). 스팟 조회는 공개 데이터라
    //   svc로 호출해도 안전하며, 이로써 로그인 유저의 RPC 직접 스크래핑 경로를 차단한다.
    const { data: spots, error: spotsError } = await svc.rpc(
      'get_spots_nearby',
      {
        p_lat: latitude,
        p_lng: longitude,
        p_radius_m: radius,
        p_limit: MAX_RESULTS,
      }
    );

    if (spotsError) {
      console.error('spots_nearby rpc error:', spotsError);
      return Response.json({ error: 'Failed to fetch spots' }, { status: 500, headers: corsHeaders });
    }

    if (!spots || spots.length === 0) {
      return Response.json({ spots: [] }, { headers: corsHeaders });
    }

    const spotIds: string[] = spots.map((s: any) => s.spot_id);

    // 성능: spotIds에만 의존하는 4개 독립 쿼리를 병렬로 (직렬 왕복 4회 → 1웨이브). spot-detail과 동일 패턴.
    const [summariesRes, recentCheckinsRes, savedRes, checkinCountsRes] = await Promise.all([
      dogId
        ? supabase.from('spot_visit_summaries')
            .select('spot_id, visit_count, last_visit_at, regular_status')
            .eq('dog_id', dogId).in('spot_id', spotIds)
        : Promise.resolve({ data: null }),
      svc.from('paw_checkins')
        .select('spot_id, feeling_tags')
        .in('spot_id', spotIds)
        .eq('visibility_level', 'spot_only')
        .eq('is_valid_for_aggregate', true)
        .gte('checked_in_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('checked_in_at', { ascending: false }),
      dogId
        ? supabase.from('saved_spots')
            .select('spot_id, saved_type')
            .eq('dog_id', dogId).in('spot_id', spotIds)
        : Promise.resolve({ data: null }),
      svc.from('paw_checkins')
        .select('spot_id')
        .in('spot_id', spotIds)
        .eq('is_valid_for_aggregate', true)
        .neq('visibility_level', 'private'),
    ]);

    // 방문 요약
    const visitSummariesMap: Record<string, any> = {};
    (summariesRes.data ?? []).forEach((s: any) => { visitSummariesMap[s.spot_id] = s; });

    // 스팟별 분위기 태그 집계 (지난 48시간)
    const atmosphereMap: Record<string, string[]> = {};
    for (const checkin of recentCheckinsRes.data ?? []) {
      (atmosphereMap[checkin.spot_id] ??= []).push(...(checkin.feeling_tags ?? []));
    }

    // 저장 여부
    const savedMap: Record<string, string> = {};
    (savedRes.data ?? []).forEach((s: any) => { savedMap[s.spot_id] = s.saved_type; });

    // 체크인 수 (커뮤니티 활동량 — 비공개 제외)
    const checkinCountMap: Record<string, number> = {};
    (checkinCountsRes.data ?? []).forEach((c: any) => {
      checkinCountMap[c.spot_id] = (checkinCountMap[c.spot_id] ?? 0) + 1;
    });

    // 뷰모델 조립
    const result = spots.map((spot: any) => {
      const summary = visitSummariesMap[spot.spot_id];
      const topTags = getTopTags(atmosphereMap[spot.spot_id] ?? []);

      return {
        spot_id: spot.spot_id,
        name: spot.name,
        category: spot.category,
        subcategory: spot.subcategory ?? null,
        latitude: spot.latitude,
        longitude: spot.longitude,
        address_text: spot.address_text,
        neighborhood: spot.neighborhood,
        cover_image_url: spot.cover_image_url,
        // DB에 이미 있는데 응답에서 빠져 있던 값들 — 목록 카드에서 쓴다
        description: meaningfulDescription(spot.description, spot.subcategory),
        facility_tags: Array.isArray(spot.tags) ? spot.tags : [],
        distance_m: Math.round(spot.distance_m),
        checkin_count: checkinCountMap[spot.spot_id] ?? 0,
        top_feeling_tags: topTags,
        atmosphere_state: deriveAtmosphereState(topTags),
        user_visit_count: summary?.visit_count ?? 0,
        last_visit_at: summary?.last_visit_at ?? null,
        regular_status: summary?.regular_status ?? 'none',
        saved_type: savedMap[spot.spot_id] ?? null,
      };
    });

    return Response.json({ spots: result }, { headers: corsHeaders });
  } catch (err) {
    console.error('spots-nearby error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

/**
 * 정보가 없는 설명은 버린다.
 * 원천 데이터의 절반(2,742곳 / 51.6%)은 description이 subcategory를 그대로 반복한다
 * ("어린이공원" 아래 "설명: 어린이공원"). 그대로 내리면 화면이 잡음으로 채워진다.
 */
function meaningfulDescription(desc?: string | null, subcategory?: string | null): string | null {
  const d = (desc ?? '').trim();
  if (!d) return null;
  return d === (subcategory ?? '').trim() ? null : d;
}

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
