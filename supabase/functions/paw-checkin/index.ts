/**
 * paw-checkin Edge Function
 *
 * 발도장 저장 트랜잭션을 처리한다.
 * - paw_checkins 레코드 삽입
 * - spot_visit_summaries 갱신 (트리거가 처리하지만 응답에 반영)
 * - familiar_dog_signals 갱신
 *
 * Request body:
 * {
 *   dogId: string,
 *   spotId: string,
 *   feelingTags: string[],
 *   note?: string,
 *   photoUrl?: string,
 *   visibilityLevel: 'private' | 'spot_only' | 'familiar_layer',
 *   sourceType: 'home' | 'spot_detail' | 'global_cta' | 'spot_search',
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// ─── 발도장 근접성 정책 (클라이언트 src/config/checkin.ts와 미러) ───
const CATEGORY_RADIUS_M: Record<string, number> = {
  park:       60,
  trail:      80,
  riverside: 100,
  beach:      80,
  rest_spot:  20,
  // 시설은 전부 점포 단위 — 건물 하나다.
  pet_cafe:     20,
  vet:          20,
  pet_grooming: 20,
  pet_boarding: 20,
};
const DEFAULT_RADIUS_M = 20;

/**
 * 발도장 1회당 사진 상한.
 * ⚠️ 정책 SSOT 미러 — 클라이언트 `src/config/checkin.ts`의 MAX_CHECKIN_PHOTOS와 동기화 필수.
 *    Deno 환경이라 TS import 불가 → 값 직접 복제. 변경 시 양쪽 모두 수정.
 */
const MAX_CHECKIN_PHOTOS = 3;
// 정확도가 이보다 나쁘면 위치를 믿지 않는다. 100m는 너무 관대했다 —
// 그만큼 마진(정확도×0.5)도 함께 커져 실질 허용 반경이 +50m까지 늘어났다.
const MIN_ACCURACY_M = 50;
const ACCURACY_MARGIN_RATIO = 0.5;
/** 마진 상한 — 정확도가 나빠도 이 이상은 봐주지 않는다 */
const MAX_ACCURACY_MARGIN_M = 20;
/** 좌표가 이보다 오래됐으면 거부한다(ms). 스토어에 남은 옛 좌표로 찍히는 것을 막는다 */
const MAX_LOCATION_AGE_MS = 2 * 60 * 1000;

function getRadiusForCategory(category?: string): number {
  return (category && CATEGORY_RADIUS_M[category]) || DEFAULT_RADIUS_M;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── SEC-13: 서버측 UGC 모더레이션 (클라 src/utils/moderation.ts 패턴을 미러 — 두 곳 동시 갱신) ───
const BANNED_PATTERNS: RegExp[] = [
  /씨발|시발|씨ㅂ|ㅅㅂ|개새끼|니애미|애미뒤|병신|ㅂㅅ|지랄|좆같|좆나|존나|개같|썅놈|썅년/,
  /꼴페미|김치녀|한남충|틀딱|급식충|똥꼬충|장애인새끼/,
  /섹스|\bsex\b|porn|야동|성인물|자위행위|에로영상/i,
  /\bfuck|\bshit\b|\bbitch\b|\bcunt\b|\bnigger\b|\bfaggot\b|\bpussy\b/i,
];
function findBannedWord(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, '');
  for (const re of BANNED_PATTERNS) {
    const m = normalized.match(re) ?? text.match(re);
    if (m) return m[0];
  }
  return null;
}

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

    // service role 클라이언트 (familiar_dog_signals 갱신용 — RLS 우회)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const {
      dogId,
      spotId,
      feelingTags = [],
      note,
      photoUrl,
      photoUrls,
      visibilityLevel = 'spot_only',
      sourceType = 'global_cta',
      userLat,
      userLng,
      accuracy,
      locationCapturedAt,
    } = body;

    // 필수 필드 검증
    if (!dogId || !spotId) {
      return Response.json(
        { error: 'dogId and spotId are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // note 길이 검증
    if (note && note.length > 200) {
      return Response.json(
        { error: 'note must be 200 characters or less' },
        { status: 400, headers: corsHeaders }
      );
    }

    // SEC-13: 서버측 모더레이션 미러 — note 금칙어 차단 + photo_url 도메인 화이트리스트 (클라 우회 방지)
    if (findBannedWord(note)) {
      return Response.json(
        { error: 'objectionable_content' },
        { status: 400, headers: corsHeaders }
      );
    }
    // 사진: 배열(photoUrls) 우선, 없으면 단일(photoUrl) 호환. 최대 3장.
    const photoPrefix = (Deno.env.get('SUPABASE_URL') ?? '') + '/storage/v1/object/public/checkin-photos/';
    const rawPhotos: unknown[] = Array.isArray(photoUrls)
      ? photoUrls
      : (photoUrl ? [photoUrl] : []);
    const photos = rawPhotos.filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (photos.length > MAX_CHECKIN_PHOTOS) {
      return Response.json(
        { error: 'too_many_photos', message: `사진은 최대 ${MAX_CHECKIN_PHOTOS}장까지 올릴 수 있어요.` },
        { status: 400, headers: corsHeaders }
      );
    }
    // 업로드 경로는 `{auth.uid()}/파일명`이다(uploadImage). 그래서 prefix + 본인 uid까지 검사한다.
    //   prefix만 보면 **남이 올린 사진의 URL을 자기 발도장에 붙일 수 있다**(사진 도용).
    //   URL은 공개 버킷이라 한 번 노출되면 누구나 알 수 있으므로 실제로 가능한 공격이다.
    const ownedPrefix = `${photoPrefix}${user.id}/`;
    if (photos.some((u) => !u.startsWith(ownedPrefix))) {
      return Response.json(
        { error: 'invalid_photo_url' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 강아지 소유 확인
    const { data: dog, error: dogError } = await supabase
      .from('dogs')
      .select('dog_id, user_id')
      .eq('dog_id', dogId)
      .eq('is_active', true)
      .single();

    if (dogError || !dog) {
      return Response.json({ error: 'Dog not found' }, { status: 404, headers: corsHeaders });
    }

    // 스팟 존재 확인 (좌표/카테고리 포함 — 근접성 검증용)
    //
    // hidden도 허용하는 이유: 사용자가 방금 제안한 장소는 검토 전까지 status='hidden'이다.
    //   "내가 발견한 곳에 첫 발도장을 남긴다"가 등록의 가장 큰 동기인데,
    //   active만 허용하면 제안 직후 발도장이 항상 404로 막혔다.
    //   남의 hidden 스팟은 RLS(spots_read_own_provisional)가 걸러주므로,
    //   여기서 hidden을 열어도 제안자 본인만 통과한다.
    const { data: spot, error: spotError } = await supabase
      .from('spots')
      .select('spot_id, name, latitude, longitude, category')
      .eq('spot_id', spotId)
      .in('status', ['active', 'hidden', 'pending'])
      .single();

    if (spotError || !spot) {
      return Response.json(
        {
          error: 'Spot not found',
          message: '장소를 찾을 수 없어요. 목록에서 다시 선택해주세요.',
        },
        { status: 404, headers: corsHeaders },
      );
    }

    // spot 좌표 무결성 (DB 누락/null island 방지)
    const spotLat = Number(spot.latitude);
    const spotLng = Number(spot.longitude);
    if (
      !Number.isFinite(spotLat) || !Number.isFinite(spotLng) ||
      (Math.abs(spotLat) < 0.01 && Math.abs(spotLng) < 0.01) ||
      spotLat < -90 || spotLat > 90 || spotLng < -180 || spotLng > 180
    ) {
      return Response.json(
        { error: 'invalid_spot', message: '장소 좌표 정보가 올바르지 않아요.' },
        { status: 422, headers: corsHeaders }
      );
    }

    // ─── 위치 근접성 검증 (서버측) ─────────────────────────────────
    // 클라이언트가 보낸 좌표가 spot으로부터 허용 반경 안에 있어야 함.
    // 클라이언트 가드는 우회 가능하므로 여기서 다시 검증.
    if (typeof userLat !== 'number' || typeof userLng !== 'number') {
      return Response.json(
        { error: 'too_far', message: '발도장은 장소 근처에서만 가능해요 (위치 정보 누락).' },
        { status: 403, headers: corsHeaders }
      );
    }
    if (typeof accuracy === 'number' && accuracy > MIN_ACCURACY_M) {
      return Response.json(
        { error: 'low_accuracy', message: `위치 정확도가 너무 낮아요 (±${Math.round(accuracy)}m).` },
        { status: 403, headers: corsHeaders }
      );
    }
    // 좌표의 나이를 본다.
    //   예전에는 앱이 **스토어에 저장된 위치**를 그대로 보냈다. 그 값은 persist까지 돼서
    //   공원에서 잡힌 좌표가 집에서도 살아 있었고, 서버는 거리 0m로 계산해 통과시켰다.
    //   이제 앱이 제출 시점에 새로 읽어 locationCapturedAt과 함께 보낸다.
    //   (구버전 앱은 이 값을 안 보낸다 — 없으면 통과시키되, 스토어 값이라 위험하다는 건 안다)
    if (typeof locationCapturedAt === 'number' && locationCapturedAt > 0) {
      const age = Date.now() - locationCapturedAt;
      if (age > MAX_LOCATION_AGE_MS) {
        return Response.json(
          {
            error: 'stale_location',
            message: '위치 정보가 오래됐어요. 현재 위치를 새로 잡은 뒤 다시 시도해주세요.',
          },
          { status: 403, headers: corsHeaders },
        );
      }
    }

    const distance = haversineMeters(userLat, userLng, spot.latitude, spot.longitude);
    const radius = getRadiusForCategory(spot.category);
    const margin = typeof accuracy === 'number'
      ? Math.min(accuracy * ACCURACY_MARGIN_RATIO, MAX_ACCURACY_MARGIN_M)
      : 0;
    const allowed = radius + margin;
    if (distance > allowed) {
      return Response.json(
        {
          error: 'too_far',
          message: `${spot.name}에서 약 ${Math.round(distance)}m 떨어져 있어요. 장소 근처(약 ${radius}m 이내)에서만 발도장이 가능해요.`,
          distance_m: Math.round(distance),
          allowed_m: Math.round(allowed),
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 중복 체크인 방지 (동일 강아지, 동일 스팟, 1시간 이내)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentCheckin } = await supabase
      .from('paw_checkins')
      .select('checkin_id')
      .eq('dog_id', dogId)
      .eq('spot_id', spotId)
      .gte('checked_in_at', oneHourAgo)
      .limit(1)
      .single();

    if (recentCheckin) {
      return Response.json(
        { error: 'Already checked in at this spot within the last hour' },
        { status: 409, headers: corsHeaders }
      );
    }

    // 발도장 삽입 (트리거가 visit_summary 자동 갱신)
    // SEC-04: service_role로 삽입 — 위에서 소유권·근접·중복을 유저 클라로 검증한 뒤에만.
    //   paw_checkins에는 유저 INSERT 정책이 없어(직접 삽입 차단) 이 엣지펑션이 유일 경로다.
    //   checked_in_at은 컬럼 기본값 now()로 서버가 확정(클라 조작 불가).
    const { data: checkin, error: insertError } = await serviceClient
      .from('paw_checkins')
      .insert({
        dog_id: dogId,
        spot_id: spotId,
        feeling_tags: feelingTags,
        note: note ?? null,
        photo_url: photos[0] ?? null,   // 하위호환: 첫 장을 레거시 컬럼에도 기록
        visibility_level: visibilityLevel,
        source_type: sourceType,
        is_valid_for_aggregate: true,
      })
      .select()
      .single();

    if (insertError || !checkin) {
      console.error('paw_checkins insert error:', insertError);
      return Response.json({ error: 'Failed to save checkin' }, { status: 500, headers: corsHeaders });
    }

    // 첨부 사진 저장(checkin_photos) + 사후 검수큐 적재 — service_role.
    // 발도장 자체는 이미 성공했으므로 사진 삽입 실패로 되돌리지 않는다(best-effort, 실패는 크게 로깅).
    // D2: 사전검수 없이 즉시 공개. 큐 적재는 게이트가 아니라 어드민이 훑을 수 있게 하는 용도.
    if (photos.length > 0) {
      const photoRows = photos.map((url, i) => ({
        checkin_id: checkin.checkin_id,
        dog_id: dogId,
        spot_id: spotId,
        storage_path: url.slice(photoPrefix.length),
        image_url: url,
        sort_order: i,
      }));
      const { error: photoErr } = await serviceClient.from('checkin_photos').insert(photoRows);
      if (photoErr) {
        console.error('checkin_photos insert error:', photoErr);
      } else {
        const modRows = photos.map((url) => ({
          content_type: 'checkin_photo',
          dog_id: dogId,
          checkin_id: checkin.checkin_id,
          image_url: url,
        }));
        const { error: modErr } = await serviceClient.from('media_moderation_queue').insert(modRows);
        if (modErr) console.error('media_moderation_queue insert error:', modErr);
      }
    }

    // familiar_dog_signals 갱신
    // visibilityLevel이 familiar_layer일 때만 신호 업데이트
    if (visibilityLevel === 'familiar_layer') {
      await updateFamiliarDogSignal(serviceClient, dogId, spotId);
    }

    // 갱신된 방문 요약 조회
    const { data: updatedSummary } = await supabase
      .from('spot_visit_summaries')
      .select('visit_count, last_visit_at, regular_status')
      .eq('dog_id', dogId)
      .eq('spot_id', spotId)
      .single();

    return Response.json(
      {
        checkin_id: checkin.checkin_id,
        spot_name: spot.name,
        checked_in_at: checkin.checked_in_at,
        visit_summary: updatedSummary ?? null,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error('paw-checkin error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});

/**
 * familiar_dog_signals 갱신
 * 동일 스팟에서 familiar_layer 체크인이 임계치 이상이면 exposure_allowed = true
 *
 * ⚠️ 정책 SSOT 미러 — 클라이언트 src/config/familiar-layer.ts FAMILIAR_LAYER_POLICY와 동기화 필수.
 *    Deno 환경이라 TS import 불가 → 값 직접 복제. 변경 시 양쪽 모두 수정.
 */
const FAMILIAR_LAYER_POLICY = {
  MIN_FAMILIAR_CHECKIN_COUNT: 2,        // ↔ MIN_FAMILIAR_CHECKIN_COUNT
  MIN_FAMILIAR_CHECKIN_WINDOW_DAYS: 30, // ↔ MIN_FAMILIAR_CHECKIN_WINDOW_DAYS
} as const;

async function updateFamiliarDogSignal(
  serviceClient: any,
  dogId: string,
  spotId: string
) {
  try {
    // 임계 윈도 내 familiar_layer 체크인 수
    const sinceMs =
      FAMILIAR_LAYER_POLICY.MIN_FAMILIAR_CHECKIN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const since30d = new Date(Date.now() - sinceMs).toISOString();
    const { count } = await serviceClient
      .from('paw_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('dog_id', dogId)
      .eq('spot_id', spotId)
      .eq('visibility_level', 'familiar_layer')
      .gte('checked_in_at', since30d);

    const recentCount = count ?? 0;
    const exposureAllowed = recentCount >= FAMILIAR_LAYER_POLICY.MIN_FAMILIAR_CHECKIN_COUNT;

    await serviceClient
      .from('familiar_dog_signals')
      .upsert(
        {
          spot_id: spotId,
          visible_dog_id: dogId,
          recent_visible_checkin_count: recentCount,
          recent_last_seen_at: new Date().toISOString(),
          exposure_allowed: exposureAllowed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'spot_id,visible_dog_id' }
      );
  } catch (err) {
    // 신호 갱신 실패는 메인 트랜잭션에 영향 없음 (best-effort)
    console.warn('familiar_dog_signals update failed (non-critical):', err);
  }
}
