/**
 * notify-familiar Edge Function
 *
 * 발도장(familiar_layer) 성공 직후 클라이언트가 호출한다.
 * 같은 스팟의 '익숙한(exposure_allowed)' 다른 강아지 주인(수신 opt-in)에게
 * "익숙한 강아지가 다녀갔어요" 알림을 생성하고 푸시한다.
 *
 * 스푸핑 방지:
 *  - 호출자가 dogId를 소유해야 함
 *  - 최근 10분 내 (dogId, spotId) familiar_layer 체크인이 실제로 있어야 함
 *
 * Request body: { dogId: string, spotId: string }
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
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const { dogId, spotId } = await req.json();
    if (!dogId || !spotId) {
      return Response.json({ error: 'dogId and spotId are required' }, { status: 400, headers: corsHeaders });
    }

    // 소유권 검증 (RLS 클라이언트 — 본인 강아지만 조회됨)
    const { data: dog } = await supabase
      .from('dogs')
      .select('dog_id, user_id, name')
      .eq('dog_id', dogId)
      .single();
    if (!dog) {
      return Response.json({ error: 'Dog not found or not owned' }, { status: 403, headers: corsHeaders });
    }

    // 최근 10분 내 실제 familiar_layer 체크인이 있어야 함 (스푸핑 방지)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentCheckin } = await supabase
      .from('paw_checkins')
      .select('checkin_id')
      .eq('dog_id', dogId)
      .eq('spot_id', spotId)
      .eq('visibility_level', 'familiar_layer')
      .gte('checked_in_at', tenMinAgo)
      .limit(1)
      .maybeSingle();
    if (!recentCheckin) {
      // 최근 체크인 없음 → 조용히 종료(정상 응답)
      return Response.json({ notified: 0 }, { headers: corsHeaders });
    }

    // 이 스팟의 익숙한(established) 다른 강아지들
    const { data: signals } = await svc
      .from('familiar_dog_signals')
      .select('visible_dog_id')
      .eq('spot_id', spotId)
      .eq('exposure_allowed', true)
      .neq('visible_dog_id', dogId)
      .limit(30);
    if (!signals || signals.length === 0) {
      return Response.json({ notified: 0 }, { headers: corsHeaders });
    }

    const dogIds = signals.map((s: any) => s.visible_dog_id);
    const [{ data: dogs }, { data: privacy }] = await Promise.all([
      svc.from('dogs').select('dog_id, user_id').in('dog_id', dogIds).eq('is_active', true),
      svc.from('privacy_settings').select('dog_id, allow_familiar_layer_exposure, default_visibility_level').in('dog_id', dogIds),
    ]);
    const optedIn = new Set(
      (privacy ?? [])
        .filter((p: any) => p.allow_familiar_layer_exposure === true && p.default_visibility_level === 'familiar_layer')
        .map((p: any) => p.dog_id)
    );
    // SEC-09: 액터와 차단관계(양방향)인 유저는 수신 대상에서 제외 — 차단당한 스토커가 위치 알림 수신 방지
    const { data: blockedUsers } = await supabase.rpc('blocked_counterpart_user_ids');
    const blockedUserIds = new Set((blockedUsers ?? []).map((r: any) => r.user_id));

    const recipients = new Set<string>();
    for (const d of dogs ?? []) {
      if (!optedIn.has(d.dog_id)) continue;
      if (d.user_id === dog.user_id) continue;  // 본인 제외
      if (blockedUserIds.has(d.user_id)) continue;  // 차단 관계(양방향) 제외
      recipients.add(d.user_id);
    }
    if (recipients.size === 0) {
      return Response.json({ notified: 0 }, { headers: corsHeaders });
    }

    // 24h 중복 방지
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await svc
      .from('notifications')
      .select('user_id')
      .in('user_id', [...recipients])
      .eq('type', 'familiar_dog_visited')
      .contains('data', { spot_id: spotId })
      .gte('created_at', since);
    const already = new Set((recent ?? []).map((r: any) => r.user_id));
    const targets = [...recipients].filter((u) => !already.has(u));
    if (targets.length === 0) {
      return Response.json({ notified: 0 }, { headers: corsHeaders });
    }

    // SEC-09: 준실시간 위치 노출 최소화 — 알림 본문에 스팟 이름을 넣지 않는다(어느 장소인지 특정 방지).
    //   spot_id는 data에만 유지(탭 시 딥링크 + 24h 중복 판정용). 시간/위치는 본문에서 드러내지 않음.
    const title = '익숙한 강아지가 다녀갔어요';
    const bodyText = '자주 보이는 강아지가 근처에 다녀갔어요.';
    await svc.from('notifications').insert(
      targets.map((uid) => ({ user_id: uid, type: 'familiar_dog_visited', title, body: bodyText, data: { spot_id: spotId } }))
    );

    // Expo 푸시 (best-effort)
    const { data: tokens } = await svc.from('push_tokens').select('expo_token').in('user_id', targets);
    const messages = (tokens ?? [])
      .map((t: any) => t.expo_token)
      .filter(Boolean)
      .map((to: string) => ({ to, title, body: bodyText, data: { spot_id: spotId }, sound: 'default' }));
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      }).catch(() => {});
    }

    return Response.json({ notified: targets.length }, { headers: corsHeaders });
  } catch (err) {
    console.error('notify-familiar error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
