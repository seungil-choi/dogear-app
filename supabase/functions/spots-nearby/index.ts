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

    // 현재 사용자 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

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

    // 방문 요약 (dogId 있을 때만)
    let visitSummariesMap: Record<string, any> = {};
    if (dogId) {
      const { data: summaries } = await supabase
        .from('spot_visit_summaries')
        .select('spot_id, visit_count, last_visit_at, regular_status')
        .eq('dog_id', dogId)
        .in('spot_id', spotIds);

      if (summaries) {
        summaries.forEach((s: any) => {
          visitSummariesMap[s.spot_id] = s;
        });
      }
    }

    // 최근 체크인 분위기 태그 집계 (지난 48시간)
    const { data: recentCheckins } = await svc
      .from('paw_checkins')
      .select('spot_id, feeling_tags')
      .in('spot_id', spotIds)
      .eq('visibility_level', 'spot_only')
      .eq('is_valid_for_aggregate', true)
      .gte('checked_in_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('checked_in_at', { ascending: false });

    // 스팟별 태그 집계
    const atmosphereMap: Record<string, string[]> = {};
    if (recentCheckins) {
      for (const checkin of recentCheckins) {
        if (!atmosphereMap[checkin.spot_id]) {
          atmosphereMap[checkin.spot_id] = [];
        }
        atmosphereMap[checkin.spot_id].push(...(checkin.feeling_tags ?? []));
      }
    }

    // 저장 여부 (dogId 있을 때만)
    const savedMap: Record<string, string> = {};
    if (dogId) {
      const { data: saved } = await supabase
        .from('saved_spots')
        .select('spot_id, saved_type')
        .eq('dog_id', dogId)
        .in('spot_id', spotIds);

      if (saved) {
        saved.forEach((s: any) => {
          savedMap[s.spot_id] = s.saved_type;
        });
      }
    }

    // 체크인 수 조회 (커뮤니티 활동량 — 비공개 제외)
    const { data: checkinCounts } = await svc
      .from('paw_checkins')
      .select('spot_id')
      .in('spot_id', spotIds)
      .eq('is_valid_for_aggregate', true)
      .neq('visibility_level', 'private');

    const checkinCountMap: Record<string, number> = {};
    if (checkinCounts) {
      checkinCounts.forEach((c: any) => {
        checkinCountMap[c.spot_id] = (checkinCountMap[c.spot_id] ?? 0) + 1;
      });
    }

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
