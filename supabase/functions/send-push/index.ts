/**
 * Edge Function: send-push
 *
 * Expo Push Service를 통해 사용자에게 푸시 알림 발송.
 *
 * 호출 예:
 *  POST /send-push
 *  { "userIds": ["uuid1", "uuid2"], "title": "...", "body": "...", "data": {} }
 *
 * 또는 단일 토큰:
 *  { "expoTokens": ["ExponentPushToken[xxx]"], "title": "...", "body": "..." }
 *
 * 호출자: 다른 Edge Function (예: paw-checkin이 끝나면 익숙한 강아지 주인에게 알림 등)
 *
 * ⚠️ **광고성 정보는 `marketing: true`를 붙여야 한다.**
 *    정보통신망법 §50은 광고 전송에 사전 동의를, §50③은 21~08시 전송에 **별도 동의**를
 *    요구한다. 지금 이 함수를 부르는 곳은 전부 서비스 알림이라 해당 사항이 없지만,
 *    나중에 광고를 붙일 때 이 검사를 잊지 않도록 함수 안에 심어 둔다.
 *    기본값은 '서비스 알림'이다 — 안전한 쪽이 기본이어야 한다.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PushBody {
  userIds?: string[];
  expoTokens?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  /** 광고성 정보 여부. true면 수신 동의·야간 동의를 검사한다(정보통신망법 §50) */
  marketing?: boolean;
}

/** 한국 시각 기준 야간(21:00~08:00) 여부 — 정보통신망법 §50③ */
function isKoreanNight(now = new Date()): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= 21 || kstHour < 8;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 내부 전용 — service-role 호출자만 허용 (일반 사용자가 임의 대상에 푸시 발송하는 것 차단)
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload: PushBody = await req.json();
    if (!payload.title || !payload.body) {
      return new Response(JSON.stringify({ error: 'title, body required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // expoTokens로 직접 쏘면 동의 검사를 우회하게 된다 — 광고에는 허용하지 않는다.
    if (payload.marketing && payload.expoTokens?.length) {
      return new Response(
        JSON.stringify({ error: 'marketing push must target userIds (consent check required)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let tokens: string[] = payload.expoTokens ?? [];

    // userIds가 있으면 token 조회
    if (payload.userIds && payload.userIds.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      let targetIds = payload.userIds;

      // ── 광고성 정보 가드 (정보통신망법 §50) ──────────────────
      //   동의하지 않은 사람에게 광고를 보내면 과태료 대상이다. 호출부가 걸러 보내주길
      //   기대하지 않고 여기서 다시 거른다 — 한 곳만 잊어도 위반이 되기 때문이다.
      if (payload.marketing) {
        const night = isKoreanNight();
        const { data: consents, error: cErr } = await supabase
          .from('consents')
          .select('user_id, marketing_push, marketing_night')
          .in('user_id', targetIds);
        if (cErr) throw cErr;

        const allowed = new Set(
          (consents ?? [])
            .filter((c: any) => c.marketing_push === true && (!night || c.marketing_night === true))
            .map((c: any) => c.user_id),
        );
        const dropped = targetIds.length - allowed.size;
        targetIds = targetIds.filter((id) => allowed.has(id));
        if (dropped > 0) {
          console.log(`[send-push] 광고 수신 동의 없음으로 제외: ${dropped}명 (야간=${night})`);
        }
        if (targetIds.length === 0) {
          return new Response(
            JSON.stringify({ sent: 0, message: 'no consented recipients', night }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }

      const { data: rows, error } = await supabase
        .from('push_tokens')
        .select('expo_token')
        .in('user_id', targetIds);
      if (error) throw error;
      tokens = tokens.concat((rows ?? []).map((r: any) => r.expo_token));
    }

    // 중복 제거
    tokens = Array.from(new Set(tokens.filter(Boolean)));

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'no tokens' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Expo Push Service 호출
    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      channelId: payload.channelId ?? 'default',
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    return new Response(JSON.stringify({ sent: tokens.length, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
