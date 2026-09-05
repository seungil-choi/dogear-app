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
/** 다녀간 강아지 레일에 올릴 최대 마리 수 */
const MAX_VISITING_DOGS = 20;
/** 방문 집계를 위해 훑는 발도장 상한 — 오래된 장소에서 전량 스캔을 막는다 */
const VISIT_SCAN_LIMIT = 400;

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
      visitingResult,
    ] = await Promise.all([
      // 스팟 기본 정보
      //   hidden 허용 — 사용자가 방금 제안한(검토 대기) 장소의 상세를 본인은 볼 수 있어야 한다.
      //   남의 hidden은 RLS(spots_read_own_provisional)가 막는다.
      supabase
        .from('spots')
        .select('*')
        .eq('spot_id', spotId)
        .in('status', ['active', 'hidden', 'pending'])
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
        .select('id, image_url, dog_id, created_at, paw_checkins!inner(visibility_level)', { count: 'exact' })
        .eq('spot_id', spotId)
        .eq('status', 'visible')
        .neq('paw_checkins.visibility_level', 'private')
        .order('created_at', { ascending: false })
        .limit(MAX_GALLERY_PHOTOS * 3), // 차단 필터로 줄어들 것을 감안해 넉넉히

      // ── 다녀간 강아지 (신설) ─────────────────────────────────────
      // ⚠️ **familiar_layer만** 본다. spot_only는 "장소 분위기에만 기여"를 고른 것이라
      //    이름·아바타를 띄우면 사용자가 고른 공개범위를 어긴다.
      //    (사진 갤러리는 이름을 안 붙이므로 private만 제외하면 된다 — 기준이 다른 이유다)
      // ⚠️ 발도장의 visibility_level로 거르지 않는다(2026-08-23 변경).
      //    신원 노출 여부는 **강아지의 현재 설정 하나**가 정한다 — 아래에서 필터한다.
      //    발도장마다 값을 박아두면 토글을 켰을 때 과거 발도장이 안 보여서,
      //    사용자는 켰는데 안 나온다고 느낀다. 프라이버시 토글은 즉시·소급이어야 한다.
      svc
        .from('paw_checkins')
        .select('dog_id, checked_in_at')
        .eq('spot_id', spotId)
        .neq('visibility_level', 'private')
        .eq('is_valid_for_aggregate', true)
        .order('checked_in_at', { ascending: false })
        .limit(VISIT_SCAN_LIMIT),
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
      ...(visitingResult.data ?? []).map((v: any) => v.dog_id),
    ].filter(Boolean)));
    const ownerByDog: Record<string, string> = {};
    const dogBriefById: Record<string, {
      name: string; avatar_url: string | null;
      bio: string | null; breed: string | null;
      weight_kg: number | null; size: string | null; age_group: string | null;
      temperament_tags: string[]; walking_style_tags: string[];
    }> = {};
    if (candidateDogIds.length > 0) {
      // 갤러리에 강아지 이름을 함께 내보내야 해서 name·avatar_url까지 한 번에 가져온다.
      // 프로필 바텀시트가 쓰는 값(소개·체중·나이·태그)도 여기서 같이 받는다 —
      // 시트를 열 때 따로 조회하면 탭할 때마다 왕복이 생긴다.
      const { data: owners } = await svc
        .from('dogs')
        .select('dog_id, user_id, name, avatar_url, bio, breed, weight_kg, size, age_group, temperament_tags, walking_style_tags')
        .in('dog_id', candidateDogIds);
      for (const d of owners ?? []) {
        ownerByDog[d.dog_id] = d.user_id;
        dogBriefById[d.dog_id] = {
          name: d.name,
          avatar_url: d.avatar_url ?? null,
          bio: d.bio ?? null,
          breed: d.breed ?? null,
          weight_kg: d.weight_kg ?? null,
          size: d.size ?? null,
          age_group: d.age_group ?? null,
          temperament_tags: d.temperament_tags ?? [],
          walking_style_tags: d.walking_style_tags ?? [],
        };
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

    // 분위기 태그 집계 — **누적(spot_stats)을 우선 쓴다.**
    //   예전엔 최근 발도장 원본에서만 뽑아, 회원이 탈퇴하면 그 장소의 분위기가 함께 사라졌다.
    //   "여기가 어떤 곳인가"는 남긴 사람이 떠나도 유효한 정보다.
    //   누적이 비어 있으면(도입 이전 장소) 기존 방식으로 물러선다.
    const { data: statsRow } = await svc
      .from('spot_stats').select('mood_counts').eq('spot_id', spotId).maybeSingle();
    const accMoods = (statsRow?.mood_counts ?? {}) as Record<string, number>;
    const topTagCounts = Object.keys(accMoods).length > 0
      ? Object.entries(accMoods)
          .map(([tag, count]) => ({ tag, count: Number(count) || 0 }))
          .filter(t => t.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
      : getTopTagCounts(recentCheckins.flatMap((c: any) => c.feeling_tags ?? []));
    const topTags = topTagCounts.map((t) => t.tag);
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

    // ── 사진 갤러리 ─────────────────────────────────────────────
    // v18에서 성격이 바뀌었다. 예전엔 **강아지별 1장**만 남겨 "다녀간 강아지" 목록 노릇을
    // 겸하게 했는데, 그러다 보니 둘 다 못 했다 — 5장 올린 강아지는 1장만 보이고,
    // 사진 없이 발도장만 찍은 강아지는 아예 안 보였다.
    // 이제 사진은 **전량 시간순**이고, 누가 왔는지는 visiting_dogs가 따로 답한다.
    //
    // 이름을 빼는 게 핵심이다. 이름이 없으면 spot_only("분위기에만 기여")도 안전하게
    // 포함할 수 있다 — 사용자가 고른 공개범위와 어긋나지 않는다.
    const visiblePhotos = (galleryResult.data ?? [])
      .filter((p: any) => !isBlockedDog(p.dog_id));
    const galleryPhotos = visiblePhotos
      .slice(0, MAX_GALLERY_PHOTOS)
      .map((p: any) => ({
        photo_id: p.id,
        image_url: p.image_url,
        created_at: p.created_at,
        // 내 강아지 사진인지 — 화면이 '삭제'를 내줄지 '신고'를 내줄지 가른다.
        // 클라가 dog_id를 비교하게 하면 남의 강아지 id를 알려주게 되므로 서버가 판정만 내려준다.
        is_mine: !!dogId && p.dog_id === dogId,
      }));
    // 총계는 차단 필터 이전 값이라 근사치다. "모두 보기"의 개수 표시에만 쓴다.
    const photoTotal = (galleryResult as any).count ?? visiblePhotos.length;

    // ── 다녀간 강아지 (신설) ────────────────────────────────────
    // 사진이 없어도 나온다. 이게 예전 구조에서 빠져 있던 것이다.
    const visitAgg: Record<string, { count: number; last: string }> = {};
    for (const v of (visitingResult.data ?? [])) {
      if (isBlockedDog(v.dog_id)) continue;
      const cur = visitAgg[v.dog_id];
      if (cur) { cur.count += 1; }
      else { visitAgg[v.dog_id] = { count: 1, last: v.checked_in_at }; }
    }
    const familiarIdSet = new Set(familiarDogs.map((d: any) => d.dog_id));

    // ⚠️ 신원 노출 게이트 — 여기가 유일한 관문이다.
    //    자기 설정을 켠 강아지만 이름·아바타가 나간다. 끄면 즉시, 과거 발도장까지 사라진다.
    //    **내 강아지는 예외** — 내가 나를 못 보면 "왜 내가 없지"가 된다.
    const exposedIds = new Set<string>();
    const candidateIds = Object.keys(visitAgg);
    if (candidateIds.length > 0) {
      const { data: ps } = await svc
        .from('privacy_settings')
        .select('dog_id, allow_familiar_layer_exposure')
        .in('dog_id', candidateIds);
      for (const r of ps ?? []) {
        if (r.allow_familiar_layer_exposure === true) exposedIds.add(r.dog_id);
      }
    }
    if (dogId) exposedIds.add(dogId);
    for (const id of candidateIds) if (!exposedIds.has(id)) delete visitAgg[id];

    // 단골 여부는 방문 요약이 이미 판정해둔 값을 쓴다(재계산하면 화면마다 달라진다)
    const visitingIds = Object.keys(visitAgg);
    const regularSet = new Set<string>();
    if (visitingIds.length > 0) {
      const { data: summaries } = await svc
        .from('spot_visit_summaries')
        .select('dog_id, regular_status')
        .eq('spot_id', spotId)
        .in('dog_id', visitingIds);
      for (const r of summaries ?? []) {
        if (r.regular_status && r.regular_status !== 'none') regularSet.add(r.dog_id);
      }
    }
    // 프로필 시트의 '발도장 N' — **이 장소가 아니라 전체 누적**이다.
    //   "이 아이가 얼마나 자주 산책을 나가는가"에 답하는 숫자라, 장소별로 세면
    //   질문이 달라진다(그건 동선에 가깝다).
    //   spot_visit_summaries(dog_id, spot_id, visit_count)를 합산한다 —
    //   paw_checkins를 세면 강아지마다 전량 스캔이라 비싸다.
    const totalPawByDog: Record<string, number> = {};
    if (visitingIds.length > 0) {
      const { data: allSummaries } = await svc
        .from('spot_visit_summaries')
        .select('dog_id, visit_count')
        .in('dog_id', visitingIds);
      for (const r of allSummaries ?? []) {
        totalPawByDog[r.dog_id] = (totalPawByDog[r.dog_id] ?? 0) + (r.visit_count ?? 0);
      }
    }

    // ── 산책 성향 폴백 ──
    //   본인이 walking_style_tags를 안 골랐을 때만 쓴다(1순위는 언제나 본인 값).
    //   여기서 계산하는 이유: 카테고리·기분 태그 분포는 그 강아지의 **전체 발도장**에
    //   있고, 클라이언트는 남의 발도장을 볼 수 없다. 앱에서 만들면 지금 보고 있는
    //   장소 하나만 보고 단정하게 된다.
    //   ⚠️ 문장만 내보낸다. 어느 장소를 언제 갔는지는 절대 담지 않는다 — 동선이 된다.
    const WALK_MIN = 5;
    const FEELING_SENTENCE: Record<string, string> = {
      quiet: '조용한 곳을 좋아해요',
      many_dogs: '강아지가 많은 곳을 좋아해요',
      good_for_short_rest: '잠깐 쉬어가기 좋은 곳을 자주 찾아요',
      come_back_again: '한 번 간 곳을 다시 찾는 편이에요',
    };
    const CATEGORY_KO: Record<string, string> = {
      park: '공원', trail: '산책로', riverside: '하천·강변', rest_spot: '쉼터',
      beach: '해변', pet_cafe: '애견카페', vet: '동물병원',
      pet_grooming: '애견미용', pet_boarding: '애견호텔', other: '그 밖의 장소',
    };
    const walkingFallbackByDog: Record<string, string[]> = {};
    const needFallback = visitingIds.filter(
      (id) => (dogBriefById[id]?.walking_style_tags ?? []).length === 0
        && (totalPawByDog[id] ?? 0) >= WALK_MIN,
    );
    if (needFallback.length > 0) {
      const { data: fbRows } = await svc
        .from('paw_checkins')
        .select('dog_id, feeling_tags, spots!inner(category)')
        .in('dog_id', needFallback)
        .limit(600);
      const catCount: Record<string, Record<string, number>> = {};
      const feelCount: Record<string, Record<string, number>> = {};
      for (const r of (fbRows ?? []) as any[]) {
        const cat = Array.isArray(r.spots) ? r.spots[0]?.category : r.spots?.category;
        if (cat) {
          catCount[r.dog_id] ??= {};
          catCount[r.dog_id][cat] = (catCount[r.dog_id][cat] ?? 0) + 1;
        }
        for (const t of (r.feeling_tags ?? [])) {
          feelCount[r.dog_id] ??= {};
          feelCount[r.dog_id][t] = (feelCount[r.dog_id][t] ?? 0) + 1;
        }
      }
      for (const id of needFallback) {
        const out: string[] = [];
        const topCat = Object.entries(catCount[id] ?? {}).sort((a, b) => b[1] - a[1])[0];
        if (topCat && CATEGORY_KO[topCat[0]]) out.push(`${CATEGORY_KO[topCat[0]]}을 가장 많이 다녀요`);
        // 'good'은 뜻이 넓어 성향이 아니고, 'noisy'는 그 아이가 아니라 장소에 대한
        // 불평이라 프로필에 올릴 말이 아니다 — 둘 다 문장으로 만들지 않는다.
        const topFeel = Object.entries(feelCount[id] ?? {})
          .filter(([k]) => FEELING_SENTENCE[k]).sort((a, b) => b[1] - a[1])[0];
        if (topFeel) out.push(FEELING_SENTENCE[topFeel[0]]);
        if (out.length > 0) walkingFallbackByDog[id] = out.slice(0, 2);   // 최대 2줄
      }
    }

    const visitingDogs = visitingIds
      .filter((id) => dogBriefById[id])
      .sort((a, b) => (visitAgg[b].last > visitAgg[a].last ? 1 : -1))
      .slice(0, MAX_VISITING_DOGS)
      .map((id) => ({
        dog_id: id,
        name: dogBriefById[id].name,
        avatar_url: dogBriefById[id].avatar_url,
        visit_count: visitAgg[id].count,
        last_visit_at: visitAgg[id].last,
        is_regular: regularSet.has(id),
        // '나와 자주 마주친' 관계 — 별도 섹션 대신 배지로 흡수한다
        is_familiar: familiarIdSet.has(id),
        is_mine: !!dogId && id === dogId,
        // ── 프로필 바텀시트용 ──
        //   ⚠️ 여기 담기는 값은 **남에게 보인다.** 신원 노출 게이트(exposedIds)를
        //      통과한 강아지만 이 배열에 남으므로 게이트는 이미 지나 있다.
        //      다만 "어디에 있었나"에 해당하는 값은 절대 넣지 않는다 — 발도장은
        //      위치 기록이라 장소·시각이 곧 동선이다.
        bio: dogBriefById[id].bio,
        breed: dogBriefById[id].breed,
        weight_kg: dogBriefById[id].weight_kg,
        size: dogBriefById[id].size,
        age_group: dogBriefById[id].age_group,
        temperament_tags: dogBriefById[id].temperament_tags,
        walking_style_tags: dogBriefById[id].walking_style_tags,
        total_paw_count: totalPawByDog[id] ?? 0,
        walking_fallback: walkingFallbackByDog[id] ?? [],
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
        // 검토 중 표시.
        //   pending = 사용자 제안, **모두에게 보이는** 상태(2026-08-23 전환)
        //   hidden  = 구버전 앱이 만든 임시 장소. 제안자 본인에게만 보인다.
        // 화면에서는 둘 다 '검토 중' 배지로 같게 다룬다 — 사용자가 구분할 필요가 없다.
        is_pending_review: spot.status === 'pending' || spot.status === 'hidden',
      },
      // 누가 다녀갔나 — 사진 유무와 무관. familiar_layer 발도장만(이름·아바타 노출 동의)
      visiting_dogs: visitingDogs,
      // 사진 — 전량 시간순, 이름 없음. private 발도장만 제외
      photos: { total: photoTotal, items: galleryPhotos },
      /** @deprecated v18에서 photos로 대체. 구버전 앱 호환용으로 한 릴리스만 유지한다 */
      dog_gallery: galleryPhotos,
      atmosphere: {
        state: atmosphereState,
        top_feeling_tags: topTags,
        // 같은 데이터의 횟수 포함본. top_feeling_tags는 구버전 앱 호환으로 남긴다.
        top_feeling_tag_counts: topTagCounts,
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

/**
 * 상위 태그를 **횟수와 함께** 돌려준다.
 * 예전엔 빈도를 세어놓고 이름만 남겨 버렸다. 화면에서 "조용해요"만 보이면
 * 한 명이 한 번 고른 것인지 스무 명이 고른 것인지 알 수 없다.
 */
function getTopTagCounts(tags: string[]): { tag: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const tag of tags) {
    freq[tag] = (freq[tag] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count }));
}

function getTopTags(tags: string[]): string[] {
  return getTopTagCounts(tags).map((t) => t.tag);
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
