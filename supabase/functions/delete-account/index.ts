/**
 * delete-account Edge Function
 *
 * 요청한 사용자의 계정을 완전히 삭제한다.
 * - public.users의 status를 'deleted'로 soft-delete
 * - auth.users에서 영구 삭제 (service_role 사용)
 *
 * App Store 5.1.1(v) 대응: 사용자 요청 시 모든 데이터 삭제 보장
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 요청자 JWT 검증
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // anon client로 JWT 검증 → auth.uid() 추출
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { reason } = await req.json().catch(() => ({}));

    // service_role client (RLS 우회 + auth.users 삭제 권한)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. public.users soft-delete (탈퇴 기록 보존, 법적 요구 대응)
    await adminClient
      .from('users')
      .update({
        status: 'deleted',
        last_active_at: new Date().toISOString(),
        // 탈퇴 사유는 별도 로그 테이블에 저장 가능 (현재는 생략)
      })
      .eq('auth_id', authUser.id);

    // 2. auth.users 영구 삭제 (cascade → dogs, paw_checkins 등 모두 삭제됨)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(authUser.id);
    if (deleteError) {
      console.error('auth.users delete failed:', deleteError);
      return new Response(JSON.stringify({ error: 'Account deletion failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: '계정이 삭제되었습니다.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('delete-account error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
