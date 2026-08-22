/**
 * quarantine-content Edge Function  (정책 18번 §11 · 게이트 "공개 차단")
 *
 * 왜 필요한가:
 *   버킷 3개가 전부 public이다. 신고로 사진을 내려도(status='hidden')
 *   그건 **DB 조회에서 빠지는 것뿐**이고, URL을 아는 사람은 파일을 계속 볼 수 있다.
 *   "숨겼다"고 기록하면서 실제로는 유통되는 상태 — 정책이 이걸 시행차단 항목으로 잡았다.
 *
 * 무엇을 하는가 (§11의 순서를 그대로 따른다):
 *   1) 원본을 private 격리 버킷으로 **먼저** 복사한다
 *   2) 복사본이 실제로 존재하고 크기가 같은지 확인한다  ← 이걸 건너뛰면 증거가 사라진다
 *   3) 그 다음에야 public 객체를 삭제한다 (여기서 URL이 죽는다)
 *   4) 격리 대장에 원본경로·해시·URL 차단 시각을 남긴다
 *
 * 순서가 뒤집히면(먼저 지우고 나중에 복사) 실패 시 원본이 영영 사라진다.
 *
 * 운영자 전용. 호출자는 admins 테이블의 active 운영자여야 한다.
 *
 * Request body:
 *   { actionId: string }                       // moderation_actions 기준 (권장)
 *   { bucket: string, path: string, actionId?: string }   // 직접 지정
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const QUARANTINE_BUCKET = 'moderation-quarantine';
const ALLOWED_SOURCES = new Set(['checkin-photos', 'dog-avatars', 'spot-suggestions']);

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // 호출자 신원은 호출자 토큰으로 확인하고, 실제 작업은 service_role로 한다.
    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // 운영자 확인 — 격리는 사용자가 부를 수 있는 동작이 아니다
    const { data: admin } = await svc
      .from('admins')
      .select('id, status')
      .eq('id', user.id)
      .maybeSingle();
    if (!admin || admin.status !== 'active') {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    let bucket: string | undefined = body.bucket;
    let path: string | undefined = body.path;
    const actionId: string | undefined = body.actionId;

    // actionId만 준 경우 대상 경로를 조치 원장에서 찾는다
    if ((!bucket || !path) && actionId) {
      const { data: action } = await svc
        .from('moderation_actions')
        .select('target_type, target_id')
        .eq('action_id', actionId)
        .maybeSingle();
      if (!action) {
        return Response.json({ error: '조치를 찾을 수 없습니다' }, { status: 404, headers: corsHeaders });
      }
      if (action.target_type !== 'checkin_photo') {
        return Response.json(
          { error: `자동 격리는 발도장 사진만 지원합니다 (target_type=${action.target_type})` },
          { status: 400, headers: corsHeaders },
        );
      }
      const { data: photo } = await svc
        .from('checkin_photos')
        .select('storage_path')
        .eq('id', action.target_id)
        .maybeSingle();
      if (!photo?.storage_path) {
        return Response.json({ error: '사진 경로를 찾을 수 없습니다' }, { status: 404, headers: corsHeaders });
      }
      bucket = 'checkin-photos';
      path = photo.storage_path;
    }

    if (!bucket || !path) {
      return Response.json({ error: 'bucket/path 또는 actionId가 필요합니다' }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_SOURCES.has(bucket)) {
      return Response.json({ error: `허용되지 않은 버킷: ${bucket}` }, { status: 400, headers: corsHeaders });
    }

    // ── 1) 원본을 읽는다 ────────────────────────────────────────────
    const { data: blob, error: dlError } = await svc.storage.from(bucket).download(path);
    if (dlError || !blob) {
      // 이미 사라진 경우도 있다(중복 호출·수동 삭제). 그건 실패가 아니라 "이미 차단됨"이다.
      const already = await svc
        .from('quarantined_objects')
        .select('quarantine_id')
        .eq('source_bucket', bucket)
        .eq('source_path', path)
        .maybeSingle();
      if (already.data) {
        return Response.json({ ok: true, alreadyQuarantined: true }, { headers: corsHeaders });
      }
      return Response.json(
        { error: `원본을 읽지 못했습니다: ${dlError?.message ?? 'not found'}` },
        { status: 404, headers: corsHeaders },
      );
    }

    const bytes = await blob.arrayBuffer();
    const hash = await sha256Hex(bytes);
    const quarantinePath = `${bucket}/${path}`;

    // ── 2) 격리 버킷에 복사 ─────────────────────────────────────────
    const { error: upError } = await svc.storage
      .from(QUARANTINE_BUCKET)
      .upload(quarantinePath, bytes, {
        contentType: blob.type || 'application/octet-stream',
        upsert: true,
      });
    if (upError) {
      return Response.json(
        { error: `격리 복사 실패: ${upError.message}` },
        { status: 500, headers: corsHeaders },
      );
    }

    // ── 3) 복사본 검증 — 이게 없으면 원본을 지울 수 없다 ────────────
    const { data: verify, error: vError } = await svc.storage
      .from(QUARANTINE_BUCKET)
      .download(quarantinePath);
    if (vError || !verify) {
      return Response.json(
        { error: '격리본 확인에 실패했습니다. 원본을 삭제하지 않았습니다.' },
        { status: 500, headers: corsHeaders },
      );
    }
    const verifyHash = await sha256Hex(await verify.arrayBuffer());
    if (verifyHash !== hash) {
      return Response.json(
        { error: '격리본 해시가 원본과 다릅니다. 원본을 삭제하지 않았습니다.' },
        { status: 500, headers: corsHeaders },
      );
    }

    // ── 4) 이제야 public 객체를 지운다 — 여기서 기존 URL이 죽는다 ───
    const { error: rmError } = await svc.storage.from(bucket).remove([path]);
    if (rmError) {
      return Response.json(
        { error: `공개 객체 삭제 실패: ${rmError.message}`, quarantined: true },
        { status: 500, headers: corsHeaders },
      );
    }

    await svc.from('quarantined_objects').insert({
      action_id: actionId ?? null,
      source_bucket: bucket,
      source_path: path,
      quarantine_path: quarantinePath,
      content_sha256: hash,
      byte_size: bytes.byteLength,
      public_url_revoked_at: new Date().toISOString(),
    });

    return Response.json(
      { ok: true, quarantinePath, sha256: hash, bytes: bytes.byteLength },
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error('[quarantine-content]', e);
    return Response.json(
      { error: (e as Error)?.message ?? 'unknown' },
      { status: 500, headers: corsHeaders },
    );
  }
});
