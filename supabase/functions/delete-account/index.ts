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

    // 1-b. SEC-16: 사용자 업로드 사진(Storage) 삭제 — 방침의 "탈퇴 시 사진 삭제" 이행.
    //   업로드 경로: {bucket}/{auth.uid()}/{filename} (src/lib/uploadImage.ts — 스토리지 정책이 auth.uid() 폴더만 허용)
    //   ⚠️ 예전엔 users.user_id 폴더만 지워서 실제 사진이 하나도 안 지워졌다(2026-10-17 적대 검증, 운영 17개 파일 전부
    //      auth.uid() 폴더). 옛 경로가 있을 수 있어 user_id 폴더도 함께 지운다.
    //   best-effort: 실패해도 계정 삭제는 진행(삭제 불가로 막지 않음).
    const { data: appUser } = await adminClient
      .from('users').select('user_id').eq('auth_id', authUser.id).maybeSingle();
    const folders = [authUser.id, appUser?.user_id].filter((f): f is string => !!f);
    for (const bucket of ['dog-avatars', 'checkin-photos', 'spot-suggestions']) {
      for (const folder of folders) {
        try {
          // 1000개 단위로 비울 때까지 반복
          for (let i = 0; i < 20; i++) {
            const { data: files } = await adminClient.storage.from(bucket).list(folder, { limit: 1000 });
            const paths = (files ?? []).filter((f: any) => f.name).map((f: any) => `${folder}/${f.name}`);
            if (paths.length === 0) break;
            await adminClient.storage.from(bucket).remove(paths);
          }
        } catch (e) {
          console.error(`storage cleanup failed for ${bucket}:`, e);
        }
      }
    }

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
