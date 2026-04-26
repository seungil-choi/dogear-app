/**
 * familiar-dogs Edge Function
 *
 * 특정 스팟에서 "익숙한 강아지" 목록을 반환한다.
 * 6가지 안전 조건을 서버에서 모두 검증한다.
 *
 * URL params: ?spotId=UUID&dogId=UUID
 * Response: FamiliarDogViewModel[]
 *
 * 노출 조건 (모두 충족해야 함):
 * 1. 조회하는 강아지(dogId)도 해당 스팟에 체크인 기록 있음
 * 2. 노출 대상 강아지의 exposure_allowed = true
 * 3. 노출 대상 강아지의 default_visibility_level = 'familiar_layer'
 * 4. 노출 대상 강아지의 allow_familiar_layer_exposure = true
 * 5. 노출 대상 강아지가 최근 30일 내 해당 스팟 familiar_layer 체크인 2회 이상
 * 6. 조회 강아지와 노출 강아지가 서로 다름
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

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

    const serviceClient = createClient(
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

    if (!spotId || !dogId) {
      return Response.json(
        { error: 'spotId and dogId are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 조건 1: 조회 강아지 본인도 해당 스팟 체크인 기록 있어야 함
    const { data: ownCheckin } = await supabase
      .from('paw_checkins')
      .select('checkin_id')
      .eq('dog_id', dogId)
      .eq('spot_id', spotId)
      .limit(1)
      .single();

    if (!ownCheckin) {
      // 방문 기록 없음 → 익숙한 강아지 기능 미노출
      return Response.json({ familiar_dogs: [] }, { headers: corsHeaders });
    }

    // exposure_allowed = true인 신호 조회 (조건 2)
    const { data: signals } = await serviceClient
      .from('familiar_dog_signals')
      .select('visible_dog_id, recent_visible_checkin_count, recent_last_seen_at')
      .eq('spot_id', spotId)
      .eq('exposure_allowed', true)
      .neq('visible_dog_id', dogId)  // 조건 6: 자기 자신 제외
      .order('recent_last_seen_at', { ascending: false })
      .limit(MAX_FAMILIAR_DOGS * 2); // 필터 후 부족할 수 있으므로 여유 있게 조회

    if (!signals || signals.length === 0) {
      return Response.json({ familiar_dogs: [] }, { headers: corsHeaders });
    }

    const candidateDogIds = signals.map((s: any) => s.visible_dog_id);

    // 조건 3, 4: privacy_settings 확인
    const { data: privacySettings } = await serviceClient
      .from('privacy_settings')
      .select('dog_id, default_visibility_level, allow_familiar_layer_exposure')
      .in('dog_id', candidateDogIds);

    const allowedDogIds = new Set<string>(
      (privacySettings ?? [])
        .filter(
          (p: any) =>
            p.default_visibility_level === 'familiar_layer' &&
            p.allow_familiar_layer_exposure === true
        )
        .map((p: any) => p.dog_id)
    );

    if (allowedDogIds.size === 0) {
      return Response.json({ familiar_dogs: [] }, { headers: corsHeaders });
    }

    // 조건 5: 최근 30일 familiar_layer 체크인 수 검증
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCheckins } = await serviceClient
      .from('paw_checkins')
      .select('dog_id')
      .in('dog_id', [...allowedDogIds])
      .eq('spot_id', spotId)
      .eq('visibility_level', 'familiar_layer')
      .gte('checked_in_at', since30d);

    const checkinCountMap: Record<string, number> = {};
    for (const c of recentCheckins ?? []) {
      checkinCountMap[c.dog_id] = (checkinCountMap[c.dog_id] ?? 0) + 1;
    }

    const qualifiedDogIds = new Set(
      Object.entries(checkinCountMap)
        .filter(([, count]) => count >= 2)
        .map(([id]) => id)
    );

    // 최종 후보 필터링
    const finalSignals = signals
      .filter((s: any) => allowedDogIds.has(s.visible_dog_id) && qualifiedDogIds.has(s.visible_dog_id))
      .slice(0, MAX_FAMILIAR_DOGS);

    if (finalSignals.length === 0) {
      return Response.json({ familiar_dogs: [] }, { headers: corsHeaders });
    }

    // 강아지 상세 정보 조회
    const finalDogIds = finalSignals.map((s: any) => s.visible_dog_id);
    const { data: dogs } = await serviceClient
      .from('dogs')
      .select('dog_id, name, avatar_url, size, temperament_tags')
      .in('dog_id', finalDogIds)
      .eq('is_active', true);

    if (!dogs || dogs.length === 0) {
      return Response.json({ familiar_dogs: [] }, { headers: corsHeaders });
    }

    const dogMap: Record<string, any> = {};
    dogs.forEach((d: any) => {
      dogMap[d.dog_id] = d;
    });

    const signalMap: Record<string, any> = {};
    finalSignals.forEach((s: any) => {
      signalMap[s.visible_dog_id] = s;
    });

    const familiarDogs = finalDogIds
      .filter((id: string) => dogMap[id])
      .map((id: string) => {
        const dog = dogMap[id];
        const signal = signalMap[id];
        return {
          dog_id: dog.dog_id,
          name: dog.name,
          avatar_url: dog.avatar_url,
          size: dog.size,
          temperament_tags: dog.temperament_tags,
          recent_checkin_count: signal.recent_visible_checkin_count,
          last_seen_at: signal.recent_last_seen_at,
        };
      });

    return Response.json({ familiar_dogs: familiarDogs }, { headers: corsHeaders });
  } catch (err) {
    console.error('familiar-dogs error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
