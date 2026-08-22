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
/** 갤러리에 내보낼 사진 수 — 강아지별 대표 1장씩(기획 14번) */
const MAX_GALLERY_PHOTOS = 12;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // 웜업 핑 — pg_cron이 5분마다 x-warmup 헤더로 부른다. 여기서 바로 끝내
  // 인스턴스만 데운다(DB 조회 없음). 콜드스타트 회피용.
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

    // 커뮤니티 흔적/집계(타 사용자 체크인)는 RLS 우회 service-role로 읽되,
    // '나만 보기'(private)는 어떤 경로로도 내보내지 않는다.
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
      galleryResult,
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

      // 최근 48시간 흔적 — '나만 보기'(private)만 빼고 조회. service-role로 전체 조회.
      //
      // 예전엔 spot_only만 봤는데, 지금 앱은 공개범위 선택 단계를 숨기고(SHOW_VISIBILITY_STEP=false)
      // familiar_layer로 고정해 발도장을 남긴다. 그래서 새로 찍히는 발도장은 흔적에 하나도
      // 뜨지 않았다(실측: spot_only 5건은 전부 구버전, 이후는 전부 familiar_layer).
      // 흔적은 강아지 정보를 빼고 익명으로만 노출되므로, spot_only에 허용된 노출은
      // 더 넓은 범위인 familiar_layer에도 성립한다. 사진 갤러리도 같은 기준(private만 제외)이라
      // 두 섹션이 어긋나지 않는다. ⚠️ 되돌리면 흔적 섹션이 영구히 빈다.
      svc
        .from('paw_checkins')
        .select('checkin_id, feeling_tags, note, photo_url, checked_in_at, visibility_level, dog_id')
        .eq('spot_id', spotId)
        .neq('visibility_level', 'private')
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

      // 강아지 사진 갤러리 — 이 장소에 남은 발도장 사진 (기획 14번)
      //   status='visible'만(신고·검수로 내려간 건 제외).
      //   발도장이 private이면 사진도 공개하지 않는다 — 사진의 공개범위는 그 발도장을 따른다.
      //   시간 제한 없음: 흔적(48h)과 달리 갤러리는 장소의 누적된 모습이다.
      svc
        .from('checkin_photos')
        .select('id, image_url, dog_id, created_at, paw_checkins!inner(visibility_level)')
        .eq('spot_id', spotId)
        .eq('status', 'visible')
        .neq('paw_checkins.visibility_level', 'private')
        .order('created_at', { ascending: false })
        .limit(MAX_GALLERY_PHOTOS * 4), // dedupe·차단 필터로 줄어들 것을 감안해 넉넉히
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
      ...(galleryResult.data ?? []).map((p: any) => p.dog_id),
    ].filter(Boolean)));
    const ownerByDog: Record<string, string> = {};
    const dogBriefById: Record<string, { name: string; avatar_url: string | null }> = {};
    if (candidateDogIds.length > 0) {
      // 갤러리에 강아지 이름을 함께 내보내야 해서 name·avatar_url까지 한 번에 가져온다.
      const { data: owners } = await svc
        .from('dogs')
        .select('dog_id, user_id, name, avatar_url')
        .in('dog_id', candidateDogIds);
      for (const d of owners ?? []) {
        ownerByDog[d.dog_id] = d.user_id;
        dogBriefById[d.dog_id] = { name: d.name, avatar_url: d.avatar_url ?? null };
      }
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

    // ── 강아지 사진 갤러리 (기획 14번) ──────────────────────────
    // 강아지별 대표 1장씩만 — 한 강아지의 사진이 갤러리를 덮는 것을 막는다.
    // 정렬은 최신순이므로 각 강아지의 가장 최근 사진이 남는다.
    const seenGalleryDogs = new Set<string>();
    const galleryPhotos = (galleryResult.data ?? [])
      .filter((p: any) => !isBlockedDog(p.dog_id))
      .filter((p: any) => {
        if (seenGalleryDogs.has(p.dog_id)) return false;
        seenGalleryDogs.add(p.dog_id);
        return true;
      })
      .slice(0, MAX_GALLERY_PHOTOS)
      .map((p: any) => ({
        photo_id: p.id,
        image_url: p.image_url,
        dog_name: dogBriefById[p.dog_id]?.name ?? null,
        created_at: p.created_at,
        // 내 강아지 사진인지 — 화면이 '삭제'를 내줄지 '신고'를 내줄지 가른다.
        // 클라가 dog_id를 비교하게 하면 남의 강아지 id를 알려주게 되므로 서버가 판정만 내려준다.
        is_mine: !!dogId && p.dog_id === dogId,
      }));

    // ── 히어로 이미지 우선순위 (기획 14번 D4) ────────────────────
    //   ① 공식 실사진(cover_image_url)
    //   ② 어드민이 지정한 대표 사진(representative_photo_id)
    //   ③ 둘 다 없으면 null → 앱이 카테고리 기본 썸네일을 그린다
    // ⚠️ 자동 승격은 하지 않는다(D3). 검수 안 된 사진이 가장 큰 자리에 오르면 안 된다.
    let representativePhotoUrl: string | null = null;
    if (!spot.cover_image_url && spot.representative_photo_id) {
      const { data: repPhoto } = await svc
        .from('checkin_photos')
        .select('image_url, status, paw_checkins!inner(visibility_level)')
        .eq('id', spot.representative_photo_id)
        .maybeSingle();
      // 대표로 지정됐더라도 그 사이 상태가 바뀌었으면 쓰지 않는다.
      //   - 신고·검수로 내려간 사진(status<>'visible')
      //   - 발도장이 '나만 보기'로 바뀐 경우 — 히어로는 전체 공개 자리라 절대 올리면 안 된다.
      //     (지정 시점에도 admin_set_representative_photo가 막지만, 지정 이후에 바뀔 수 있다)
      // ⚠️ PostgREST 임베드는 관계 추론에 따라 객체로도, 배열로도 온다.
      //    한쪽만 가정하면 값이 조용히 undefined가 되고, 그러면 이 방어가 통째로 무력화된다
      //    (private인데 'private이 아님'으로 통과). 양쪽을 모두 받는다.
      const repRel = (repPhoto as any)?.paw_checkins;
      const repVisibility = Array.isArray(repRel)
        ? repRel[0]?.visibility_level
        : repRel?.visibility_level;
      // 공개범위를 읽지 못했으면(관계 형태가 예상과 다르거나 필드 누락) 쓰지 않는다.
      // 히어로가 기본 썸네일로 남는 건 사소하지만, private 사진이 올라가는 건 사고다.
      const repIsPublic = repVisibility === 'spot_only' || repVisibility === 'familiar_layer';
      if (repPhoto?.status === 'visible' && repIsPublic) {
        representativePhotoUrl = repPhoto.image_url;
      }
    }
    const heroImageUrl: string | null = spot.cover_image_url ?? representativePhotoUrl;

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
        // 시설(병원·미용)에서 사용자가 가장 먼저 찾는 값.
        // 영업시간 데이터가 없는 지금 "지금 하나요"는 전화로만 확인된다.
        phone: spot.phone ?? null,
        // 한 업체가 병원+미용+호텔을 겸하는 경우가 흔하다(복수 서비스 4,200곳).
        // category는 대표 1개뿐이라, 나머지는 여기서만 드러난다.
        services: Array.isArray(spot.services) ? spot.services : [],
        cover_image_url: spot.cover_image_url,
        // 히어로에 실제로 그릴 이미지 — 공식사진 → 대표사진 순. null이면 기본 썸네일.
        // 화면이 우선순위를 다시 계산하지 않도록 서버가 하나로 정해서 내려준다.
        hero_image_url: heroImageUrl,
        // 아래 두 필드는 DB에 채워져 있는데 응답에서 빠져 있어 화면에 닿지 못하고 있었다.
        //   설명 실질 정보 2,487곳(46.8%) · 편의시설 2,171곳(40.8%)
        // 설명 정제 규칙은 앱의 authoredDescription 한 곳에만 둔다
        description: spot.description ?? null,
        facility_tags: Array.isArray(spot.tags) ? spot.tags : [],
        // 검토 대기(hidden) 상태를 화면이 알 수 있게 — 제안자 본인에게만 보이는 상태다
        is_pending_review: spot.status === 'hidden',
      },
      // 이곳에 다녀간 강아지들 — 강아지별 최신 1장
      dog_gallery: galleryPhotos,
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
