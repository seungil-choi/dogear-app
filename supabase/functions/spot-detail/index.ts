/**
 * spot-detail Edge Function
 *
 * 스팟 상세 뷰모델을 조립한다.
 * URL param: ?spotId=UUID&dogId=UUID(optional)
 * Response: SpotDetailViewModel
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const RECENT_CHECKIN_HOURS = 48;
const MAX_RECENT_CHECKINS = 20;
const MAX_FAMILIAR_DOGS = 6;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

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

    // 커뮤니티 흔적/집계(타 사용자 체크인)는 RLS 우회 service-role로 읽되,
    // 공개(spot_only)만 노출해 familiar_layer/private 프라이버시를 보호한다.
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const spotId = url.searchParams.get('spotId');
    const dogId = url.searchParams.get('dogId');

    if (!spotId) {
      return Response.json({ error: 'spotId is required' }, { status: 400, headers: corsHeaders });
    }

    // 병렬로 데이터 조회
    const since48h = new Date(Date.now() - RECENT_CHECKIN_HOURS * 60 * 60 * 1000).toISOString();

    const [
      spotResult,
      recentCheckinsResult,
      visitSummaryResult,
      savedSpotResult,
      familiarDogsResult,
      blocksResult,
    ] = await Promise.all([
      // 스팟 기본 정보
      //   hidden 허용 — 사용자가 방금 제안한(검토 대기) 장소의 상세를 본인은 볼 수 있어야 한다.
      //   남의 hidden은 RLS(spots_read_own_provisional)가 막는다.
      supabase
        .from('spots')
        .select('*')
        .eq('spot_id', spotId)
        .in('status', ['active', 'hidden'])
        .single(),

      // 최근 48시간 공개 체크인(흔적) — 공개(spot_only)만, service-role로 전체 조회
      svc
        .from('paw_checkins')
        .select('checkin_id, feeling_tags, note, photo_url, checked_in_at, visibility_level, dog_id')
        .eq('spot_id', spotId)
        .eq('visibility_level', 'spot_only')
        .eq('is_valid_for_aggregate', true)
        .gte('checked_in_at', since48h)
        .order('checked_in_at', { ascending: false })
        .limit(MAX_RECENT_CHECKINS),

      // 방문 요약 (dogId 있을 때)
      dogId
        ? supabase
            .from('spot_visit_summaries')
            .select('*')
            .eq('dog_id', dogId)
            .eq('spot_id', spotId)
            .single()
        : Promise.resolve({ data: null, error: null }),

      // 저장 여부 (dogId 있을 때)
      dogId
        ? supabase
            .from('saved_spots')
            .select('saved_type, saved_at')
            .eq('dog_id', dogId)
            .eq('spot_id', spotId)
            .single()
        : Promise.resolve({ data: null, error: null }),

      // 익숙한 강아지 (exposure_allowed = true인 것만)
      dogId
        ? supabase
            .from('familiar_dog_signals')
            .select('visible_dog_id, recent_visible_checkin_count, recent_last_seen_at')
            .eq('spot_id', spotId)
            .eq('exposure_allowed', true)
            .order('recent_last_seen_at', { ascending: false })
            .limit(MAX_FAMILIAR_DOGS)
        : Promise.resolve({ data: null, error: null }),

      // SEC-08: 차단 양방향 — 내가↔상대 어느 방향이든 차단관계인 유저 집합(소유주 단위 제외)
      supabase.rpc('blocked_counterpart_user_ids'),
    ]);

    if (spotResult.error || !spotResult.data) {
      return Response.json({ error: 'Spot not found' }, { status: 404, headers: corsHeaders });
    }

    const spot = spotResult.data;
    // SEC-08: 차단 양방향 제외 — 소유주 단위. 후보 강아지(흔적+익숙강아지)의 소유주를 조회해 차단 유저면 제외
    const blockedUserIds = new Set((blocksResult.data ?? []).map((r: any) => r.user_id));
    const candidateDogIds = Array.from(new Set([
      ...(recentCheckinsResult.data ?? []).map((c: any) => c.dog_id),
      ...(familiarDogsResult.data ?? []).map((f: any) => f.visible_dog_id),
    ].filter(Boolean)));
    const ownerByDog: Record<string, string> = {};
    if (candidateDogIds.length > 0) {
      const { data: owners } = await svc.from('dogs').select('dog_id, user_id').in('dog_id', candidateDogIds);
      for (const d of owners ?? []) ownerByDog[d.dog_id] = d.user_id;
    }
    const isBlockedDog = (dId: string) => blockedUserIds.has(ownerByDog[dId]);
    const recentCheckins = (recentCheckinsResult.data ?? [])
      .filter((c: any) => !isBlockedDog(c.dog_id));

    // 공개 집계 — 발도장 수 / 남긴 강아지 수 / 저장 수 / 단골 수 / 첫 발도장 시각.
    //   distinct 집계라 PostgREST로 표현할 수 없어 DB 함수 한 번으로 끝낸다.
    //   (예전에는 총 발도장 수만 셌고, 화면의 "방문한 강아지"는 최근 발도장 수를
    //    그대로 재사용해 두 지표가 항상 같은 숫자로 보였다.)
    const { data: statsRows } = await svc.rpc('spot_public_stats', { p_spot_id: spotId });
    const stats = (Array.isArray(statsRows) ? statsRows[0] : statsRows) ?? {};
    const totalCheckinCount: number = stats.checkin_count ?? 0;

    // 분위기 태그 집계
    const allTags: string[] = recentCheckins.flatMap((c: any) => c.feeling_tags ?? []);
    const topTags = getTopTags(allTags);
    const atmosphereState = deriveAtmosphereState(topTags);

    // 익숙한 강아지 정보 조회 (dog_id → dog 정보) — 차단한 강아지 제외
    let familiarDogs: any[] = [];
    const familiarSignals = (familiarDogsResult.data ?? [])
      .filter((f: any) => !isBlockedDog(f.visible_dog_id));
    if (familiarSignals.length > 0) {
      const familiarDogIds = familiarSignals.map((f: any) => f.visible_dog_id);
      const { data: dogDetails } = await supabase
        .from('dogs')
        .select('dog_id, name, avatar_url, size, temperament_tags')
        .in('dog_id', familiarDogIds)
        .eq('is_active', true);

      if (dogDetails) {
        const dogMap: Record<string, any> = {};
        dogDetails.forEach((d: any) => {
          dogMap[d.dog_id] = d;
        });

        familiarDogs = familiarSignals
          .filter((f: any) => dogMap[f.visible_dog_id])
          .map((f: any) => {
            const dog = dogMap[f.visible_dog_id];
            return {
              dog_id: dog.dog_id,
              name: dog.name,
              avatar_url: dog.avatar_url,
              size: dog.size,
              temperament_tags: dog.temperament_tags,
              recent_checkin_count: f.recent_visible_checkin_count,
              last_seen_at: f.recent_last_seen_at,
            };
          });
      }
    }

    // 최근 체크인 뷰모델 (dog 정보 없이 — 프라이버시)
    const recentTraces = recentCheckins.map((c: any) => ({
      checkin_id: c.checkin_id,
      feeling_tags: c.feeling_tags,
      note: c.visibility_level === 'private' ? null : c.note,
      photo_url: c.photo_url,
      checked_in_at: c.checked_in_at,
    }));

    // 뷰모델 조립
    const viewModel = {
      spot: {
        spot_id: spot.spot_id,
        name: spot.name,
        category: spot.category,
        subcategory: spot.subcategory ?? null,
        latitude: spot.latitude,
        longitude: spot.longitude,
        address_text: spot.address_text,
        neighborhood: spot.neighborhood,
        cover_image_url: spot.cover_image_url,
        // 아래 두 필드는 DB에 채워져 있는데 응답에서 빠져 있어 화면에 닿지 못하고 있었다.
        //   설명 실질 정보 2,487곳(46.8%) · 편의시설 2,171곳(40.8%)
        // 설명 정제 규칙은 앱의 authoredDescription 한 곳에만 둔다
        description: spot.description ?? null,
        facility_tags: Array.isArray(spot.tags) ? spot.tags : [],
        // 검토 대기(hidden) 상태를 화면이 알 수 있게 — 제안자 본인에게만 보이는 상태다
        is_pending_review: spot.status === 'hidden',
      },
      atmosphere: {
        state: atmosphereState,
        top_feeling_tags: topTags,
        recent_checkin_count: recentCheckins.length,
        total_checkin_count: totalCheckinCount ?? 0,
      },
      // 커뮤니티 집계 — 0이면 화면에서 숨긴다(빈 0의 나열은 죽은 서비스로 보인다)
      community: {
        unique_dog_count:  stats.unique_dog_count ?? 0,
        saved_count:       stats.saved_count ?? 0,
        regular_dog_count: stats.regular_dog_count ?? 0,
        first_checkin_at:  stats.first_checkin_at ?? null,
        last_checkin_at:   stats.last_checkin_at ?? null,
      },
      user_relation: dogId ? {
        visit_count: visitSummaryResult.data?.visit_count ?? 0,
        last_visit_at: visitSummaryResult.data?.last_visit_at ?? null,
        first_visit_at: visitSummaryResult.data?.first_visit_at ?? null,
        regular_status: visitSummaryResult.data?.regular_status ?? 'none',
        saved_type: savedSpotResult.data?.saved_type ?? null,
        saved_at: savedSpotResult.data?.saved_at ?? null,
      } : null,
      familiar_dogs: familiarDogs,
      recent_traces: recentTraces,
    };

    return Response.json(viewModel, { headers: corsHeaders });
  } catch (err) {
    console.error('spot-detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

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

function deriveAtmosphereState(tags: string[]): string {
  if (tags.length === 0) return 'unknown';
  const hasQuiet = tags.includes('quiet');
  const hasActive = tags.includes('many_dogs') || tags.includes('noisy');
  if (hasQuiet && !hasActive) return 'quiet';
  if (hasActive && !hasQuiet) return 'active';
  if (hasQuiet && hasActive) return 'mixed';
  return 'unknown';
}
