/**
 * Edge Function: kakao-auth
 *
 * 카카오 access token을 받아 사용자를 검증하고 Supabase 세션을 생성한다.
 *
 * 흐름:
 *  1. 클라이언트(앱)에서 카카오 SDK로 로그인 → access_token 획득
 *  2. 이 함수에 access_token 전달
 *  3. 카카오 API로 사용자 정보 조회 (profile, email)
 *  4. Supabase auth.users에 등록(없으면 생성)하고 세션 발급
 *  5. session(access_token, refresh_token) 반환
 *
 * 환경변수:
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase가 자동 주입)
 *  - 카카오는 외부 토큰 검증만 하므로 별도 시크릿 불필요
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { kakaoAccessToken } = await req.json();
    if (!kakaoAccessToken) {
      return new Response(JSON.stringify({ error: 'kakaoAccessToken required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. 카카오 사용자 정보 조회
    const kakaoRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${kakaoAccessToken}` },
    });
    if (!kakaoRes.ok) {
      return new Response(JSON.stringify({ error: 'invalid kakao token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const kakaoUser = await kakaoRes.json();
    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email ?? `kakao_${kakaoId}@kakao.local`;
    const nickname = kakaoUser.kakao_account?.profile?.nickname ?? '카카오사용자';

    // 2. Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 3. 기존 사용자 확인 또는 생성
    const userMetadata = { provider: 'kakao', kakao_id: kakaoId, nickname };

    // createUser를 먼저 시도하고 "이미 존재(email_exists)"는 정상 흐름으로 흡수한다.
    //   ⚠️ 이전 방식(listUsers로 조회)은 1페이지 50명만 반환 → 사용자 50명 초과 시
    //      기존 유저를 못 찾고 중복 생성 시도 → 500으로 모든 재로그인이 깨지는 버그.
    //   generateLink는 기존 사용자에게도 정상 동작하므로 존재 조회 자체가 불필요.
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (createError) {
      const already =
        (createError as any).code === 'email_exists' ||
        (createError as any).status === 422 ||
        /already|registered|exists/i.test(createError.message ?? '');
      if (!already) throw createError;
      // 기존 사용자 → 그대로 진행
    }

    // 4. magic link로 일회성 토큰 발급 → 클라이언트에서 verifyOtp
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkError) throw linkError;

    // properties.hashed_token + properties.email_otp로 클라이언트가 verifyOtp 호출
    return new Response(JSON.stringify({
      email,
      nickname,
      otp: (linkData as any).properties?.email_otp,
      hashed_token: (linkData as any).properties?.hashed_token,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('kakao-auth error:', err);
    // 내부 에러 상세는 로그에만 — 응답 본문으로 유출하지 않음
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
