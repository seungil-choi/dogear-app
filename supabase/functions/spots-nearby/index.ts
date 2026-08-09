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
      return Response.json({ spots: [], truncated: false }, { headers: corsHeaders });
    }

    const spotIds: string[] = spots.map((s: any) => s.spot_id);

    // 성능: spotIds에만 의존하는 독립 쿼리를 병렬로 (직렬 왕복 → 1웨이브).
    //   예전에는 paw_checkins를 두 번 쳤다 — 48시간 분위기용 1회, **개수만 세려고 전량** 1회.
    //   두 번째는 시간 제한이 없어 체크인이 쌓일수록 지도 팬마다 전량을 실어 날랐다.
    //   집계를 DB(spot_list_stats)로 내려 스팟당 한 줄만 받는다.
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

    // 방문 요약
    const visitSummariesMap: Record<string, any> = {};
    (summariesRes.data ?? []).forEach((s: any) => { visitSummariesMap[s.spot_id] = s; });

    // 저장 여부
    const savedMap: Record<string, string> = {};
    (savedRes.data ?? []).forEach((s: any) => { savedMap[s.spot_id] = s.saved_type; });

    // 스팟별 집계 — DB가 계산한 값을 그대로 받는다(누적 발도장 수 + 최근 48시간 감정 태그)
    const atmosphereMap: Record<string, string[]> = {};
    const checkinCountMap: Record<string, number> = {};
    const savedCountMap: Record<string, number> = {};
    for (const row of (statsRes.data ?? []) as any[]) {
      checkinCountMap[row.spot_id] = row.checkin_count ?? 0;
      atmosphereMap[row.spot_id] = row.recent_tags ?? [];
      savedCountMap[row.spot_id] = row.saved_count ?? 0;
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
        // DB에 이미 있는데 응답에서 빠져 있던 값들 — 목록 카드에서 쓴다
        // 설명 정제 규칙은 앱의 authoredDescription 한 곳에만 둔다(서버에 두면 규칙이 둘로 갈라진다)
        description: spot.description ?? null,
        facility_tags: Array.isArray(spot.tags) ? spot.tags : [],
        distance_m: Math.round(spot.distance_m),
        checkin_count: checkinCountMap[spot.spot_id] ?? 0,
        top_feeling_tags: topTags,
        atmosphere_state: deriveAtmosphereState(topTags),
        user_visit_count: summary?.visit_count ?? 0,
        last_visit_at: summary?.last_visit_at ?? null,
        regular_status: summary?.regular_status ?? 'none',
        saved_type: savedMap[spot.spot_id] ?? null,
        // 이 장소를 저장한 사람 수(내 저장 여부와 별개) — 홈 카드 저장 버튼이
        // 장소 상세 키비주얼과 같은 표시를 쓰려면 목록에서도 필요하다.
        saved_count: savedCountMap[spot.spot_id] ?? 0,
      };
    });

    // 상한에 걸려 잘렸는지 알린다. 서버가 총계를 세면(=반경 전체 count) KNN 이득이 사라지므로
    // 반환 개수만으로 판단한다. 앱은 이 값으로 '더 좁혀 보세요' 안내를 띄울 수 있다.
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
