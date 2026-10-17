/**
 * Edge Function: admin-purge-storage — 어드민 '계정 영구 삭제' 직전에 그 사용자의 사진 파일을 지운다.
 *
 * 왜: admin_delete_user(RPC)는 auth.users만 지운다. 업로드 사진은 Storage의 {auth.uid()}/ 폴더에
 *     있어 DB 삭제로는 안 지워진다. 계정이 사라지면 폴더 주인을 더는 알 수 없으므로 먼저 지운다.
 *     처리방침 "탈퇴 시 사진 삭제"와 짝(2026-10-17 QA). 본인 탈퇴는 delete-account가 같은 일을 한다.
 *
 * 권한: 호출자 JWT로 is_admin_at_least('super_admin')를 확인한다(admin_delete_user와 같은 등급).
 * 입력: { user_id } — 앱 users.user_id
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const BUCKETS = ['dog-avatars', 'checkin-photos', 'spot-suggestions'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ok, error: roleErr } = await caller.rpc('is_admin_at_least', { p_min: 'super_admin' });
  if (roleErr || ok !== true) return json({ error: 'forbidden' }, 403);

  const { user_id } = await req.json().catch(() => ({}));
  if (typeof user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user_id)) return json({ error: 'bad_request' }, 400);

  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u } = await svc.from('users').select('auth_id').eq('user_id', user_id).maybeSingle();
  if (!u?.auth_id) return json({ error: 'user_not_found' }, 404);

  let removed = 0;
  const failures: string[] = [];
  for (const bucket of BUCKETS) {
    for (const folder of [u.auth_id, user_id]) {   // 옛 경로(user_id)도 함께
      try {
        for (let i = 0; i < 20; i++) {
          const { data: files, error } = await svc.storage.from(bucket).list(folder, { limit: 1000 });
          if (error) throw error;
          const paths = (files ?? []).filter((f: any) => f.name).map((f: any) => `${folder}/${f.name}`);
          if (paths.length === 0) break;
          const { error: rmErr } = await svc.storage.from(bucket).remove(paths);
          if (rmErr) throw rmErr;
          removed += paths.length;
        }
      } catch (e) {
        failures.push(`${bucket}: ${(e as Error)?.message ?? e}`);
      }
    }
  }
  if (failures.length) {
    console.error('admin-purge-storage failures:', failures);
    return json({ error: `storage cleanup failed (${failures.length})`, removed }, 500);
  }
  return json({ removed });
});
