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
      visibilityLevel = 'spot_only',
      sourceType = 'global_cta',
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

    // 스팟 존재 확인
    const { data: spot, error: spotError } = await supabase
      .from('spots')
      .select('spot_id, name')
      .eq('spot_id', spotId)
      .eq('status', 'active')
      .single();

    if (spotError || !spot) {
      return Response.json({ error: 'Spot not found' }, { status: 404, headers: corsHeaders });
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
    const { data: checkin, error: insertError } = await supabase
      .from('paw_checkins')
      .insert({
        dog_id: dogId,
        spot_id: spotId,
        feeling_tags: feelingTags,
        note: note ?? null,
        photo_url: photoUrl ?? null,
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
 * 동일 스팟에서 familiar_layer 체크인이 2회 이상이면 exposure_allowed = true
 */
async function updateFamiliarDogSignal(
  serviceClient: any,
  dogId: string,
  spotId: string
) {
  try {
    // 최근 30일 familiar_layer 체크인 수
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await serviceClient
      .from('paw_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('dog_id', dogId)
      .eq('spot_id', spotId)
      .eq('visibility_level', 'familiar_layer')
      .gte('checked_in_at', since30d);

    const recentCount = count ?? 0;
    const exposureAllowed = recentCount >= 2;

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
