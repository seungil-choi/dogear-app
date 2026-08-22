/**
 * run-content-deletions Edge Function  (정책 18번 §8.3·§11)
 *
 * 14일 이의기간이 끝난 콘텐츠를 실제로 지우는 배치. pg_cron이 매일 부른다.
 *
 * 왜 엣지함수인가:
 *   삭제가 DB 한 줄로 끝나지 않는다. 스토리지 객체(공개본·격리본)까지 지워야
 *   "정말 지워진" 상태가 된다. SQL에서는 스토리지를 만질 수 없다.
 *
 * 안전장치 (하나라도 걸리면 그 건은 건너뛴다):
 *   ① 심사 중인 이의        ② legal_hold        ③ 복구(reverted)
 *   목록을 뽑을 때 한 번, finalize_content_deletion에서 실행 직전에 또 한 번 본다.
 *   목록을 읽고 실제로 지우기까지 시간이 흐르므로 두 번 확인해야 한다.
 *
 * 인증: cron 전용 공유 비밀(x-cron-secret). 사용자 토큰으로는 부를 수 없다.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const QUARANTINE_BUCKET = 'moderation-quarantine';

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const result = { deleted: 0, failed: 0, purged: 0, skipped: 0, errors: [] as string[] };

  // ── 1) 이의기간이 끝난 콘텐츠 삭제 ────────────────────────────────
  const { data: due, error: dueError } = await svc.rpc('list_due_content_deletions', { p_limit: 100 });
  if (dueError) {
    return Response.json({ error: `목록 조회 실패: ${dueError.message}` }, { status: 500 });
  }

  for (const row of due ?? []) {
    const actionId = row.action_id as string;
    try {
      // 공개본이 아직 남아 있으면 지운다(격리를 안 거친 건). 없으면 조용히 넘어간다.
      if (row.storage_bucket && row.storage_path) {
        const { error } = await svc.storage.from(row.storage_bucket).remove([row.storage_path]);
        // "없음"은 실패가 아니다 — 이미 격리 단계에서 지워졌을 수 있다
        if (error && !/not.?found|does not exist/i.test(error.message)) throw error;
      }

      // DB 흔적 정리 + 삭제 확정. 이 함수가 실행 직전 3중 확인을 다시 한다.
      const { error: finErr } = await svc.rpc('finalize_content_deletion', { p_action_id: actionId });
      if (finErr) throw finErr;

      // 확정됐는지 되읽어 확인 — 안전장치에 걸려 건너뛴 경우와 구분한다
      const { data: after } = await svc
        .from('moderation_actions')
        .select('deleted_at')
        .eq('action_id', actionId)
        .maybeSingle();

      if (after?.deleted_at) result.deleted++;
      else result.skipped++;   // 이의·보존잠금·복구로 보류됨
    } catch (e) {
      result.failed++;
      const msg = (e as Error)?.message ?? 'unknown';
      result.errors.push(`${actionId}: ${msg}`);
      await svc.rpc('mark_deletion_result', { p_action_id: actionId, p_ok: false, p_error: msg });
    }
  }

  // ── 2) 보존기한이 지난 격리본 파기 ────────────────────────────────
  const { data: purges } = await svc.rpc('list_due_quarantine_purges', { p_limit: 200 });
  for (const q of purges ?? []) {
    try {
      const { error } = await svc.storage.from(QUARANTINE_BUCKET).remove([q.quarantine_path]);
      if (error && !/not.?found|does not exist/i.test(error.message)) throw error;
      await svc.rpc('mark_quarantine_purged', { p_quarantine_id: q.quarantine_id });
      result.purged++;
    } catch (e) {
      result.errors.push(`quarantine ${q.quarantine_id}: ${(e as Error)?.message}`);
    }
  }

  console.log('[run-content-deletions]', JSON.stringify(result));
  return Response.json(result);
});
