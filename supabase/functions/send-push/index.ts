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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: PushBody = await req.json();
    if (!payload.title || !payload.body) {
      return new Response(JSON.stringify({ error: 'title, body required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let tokens: string[] = payload.expoTokens ?? [];

    // userIds가 있으면 token 조회
    if (payload.userIds && payload.userIds.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: rows, error } = await supabase
        .from('push_tokens')
        .select('expo_token')
        .in('user_id', payload.userIds);
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
