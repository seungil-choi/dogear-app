/**
 * delete-checkin-photo Edge Function
 *
 * 사용자가 자기 발도장 사진(또는 발도장 전체)을 지운다.
 *
 * 왜 엣지함수인가:
 *   지우는 일이 DB 한 줄로 끝나지 않는다. 아래를 전부 해야 "정말 지워진" 상태가 된다.
 *     1) checkin_photos 행 삭제
 *     2) **스토리지 파일 삭제** — 버킷이 public이라 파일이 남으면 URL을 아는 사람은 계속 본다
 *     3) 대표(히어로) 사진이었으면 해제 — 안 하면 장소 상단이 깨진 이미지가 된다
 *     4) 검수 큐 정리 — 이미 사라진 사진을 어드민이 계속 검수하게 두지 않는다
 *   클라이언트에 DELETE 권한을 주면 이 중 하나만 실패해도 어긋난 상태가 남으므로
 *   RLS는 잠가두고(본인 SELECT만) 쓰기는 이 함수 하나로 모은다.
 *
 * Request body:
 *   { photoId: string }    // 사진 한 장 삭제
 *   { checkinId: string }  // 발도장 통째 삭제 (딸린 사진 전부 포함)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const BUCKET = 'checkin-photos';

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
      { global: { headers: { Authorization: authHeader } } },
    );
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const { photoId, checkinId } = await req.json().catch(() => ({}));
    if (!photoId && !checkinId) {
      return Response.json(
        { error: 'photoId or checkinId is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    // ── 내 강아지 목록 (소유 판정의 기준) ─────────────────────────
    // ⚠️ ID 공간 주의: dogs.user_id(앱 ID) ≠ auth.uid()(auth_id). users를 거쳐야 한다.
    const { data: me } = await svc
      .from('users').select('user_id').eq('auth_id', user.id).maybeSingle();
    if (!me) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    const { data: myDogs } = await svc
      .from('dogs').select('dog_id').eq('user_id', me.user_id);
    const myDogIds = new Set((myDogs ?? []).map((d: any) => d.dog_id));
    if (myDogIds.size === 0) {
      return Response.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders });
    }

    // ── 지울 사진들을 모은다 ────────────────────────────────────
    let photos: { id: string; storage_path: string; dog_id: string; checkin_id: string }[] = [];
    let targetCheckinId: string | null = null;

    if (photoId) {
      const { data: p } = await svc
        .from('checkin_photos')
        .select('id, storage_path, dog_id, checkin_id')
        .eq('id', photoId).maybeSingle();
      if (!p) return Response.json({ error: 'not_found' }, { status: 404, headers: corsHeaders });
      if (!myDogIds.has(p.dog_id)) {
        return Response.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders });
      }
      photos = [p as any];
    } else {
      const { data: c } = await svc
        .from('paw_checkins').select('checkin_id, dog_id').eq('checkin_id', checkinId).maybeSingle();
      if (!c) return Response.json({ error: 'not_found' }, { status: 404, headers: corsHeaders });
      if (!myDogIds.has(c.dog_id)) {
        return Response.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders });
      }
      targetCheckinId = c.checkin_id;
      const { data: ps } = await svc
        .from('checkin_photos')
        .select('id, storage_path, dog_id, checkin_id')
        .eq('checkin_id', checkinId);
      photos = (ps ?? []) as any;
    }

    const photoIds = photos.map((p) => p.id);
    const paths = photos.map((p) => p.storage_path).filter(Boolean);

    // ── 3) 대표 사진이었으면 먼저 해제 ─────────────────────────
    // 사진 행을 지우면 FK가 set null로 풀어주긴 하지만, 순서를 명시해 의도를 남긴다.
    if (photoIds.length > 0) {
      const { error: repErr } = await svc
        .from('spots')
        .update({ representative_photo_id: null })
        .in('representative_photo_id', photoIds);
      if (repErr) console.error('representative unset failed:', repErr);
    }

    // ── 4) 검수 큐 정리 ────────────────────────────────────────
    if (photoIds.length > 0) {
      const { error: mqErr } = await svc
        .from('media_moderation_queue')
        .delete()
        .in('checkin_id', Array.from(new Set(photos.map((p) => p.checkin_id))))
        .eq('content_type', 'checkin_photo');
      if (mqErr) console.error('moderation queue cleanup failed:', mqErr);
    }

    // ── 1) DB 행 삭제 ──────────────────────────────────────────
    if (targetCheckinId) {
      // 발도장 통째 삭제 — checkin_photos는 FK cascade로 함께 지워진다.
      const { error } = await svc.from('paw_checkins').delete().eq('checkin_id', targetCheckinId);
      if (error) {
        console.error('checkin delete failed:', error);
        return Response.json({ error: 'delete_failed' }, { status: 500, headers: corsHeaders });
      }
    } else if (photoIds.length > 0) {
      const { error } = await svc.from('checkin_photos').delete().in('id', photoIds);
      if (error) {
        console.error('photo delete failed:', error);
        return Response.json({ error: 'delete_failed' }, { status: 500, headers: corsHeaders });
      }
    }

    // ── 2) 스토리지 파일 삭제 ──────────────────────────────────
    // DB를 먼저 지운 뒤에 파일을 지운다. 반대로 하면 파일만 사라지고 행이 남아
    // 갤러리에 깨진 이미지가 뜬다. 여기서 실패하면 고아 파일이 남지만 화면에는 안 보인다.
    if (paths.length > 0) {
      const { error: rmErr } = await svc.storage.from(BUCKET).remove(paths);
      if (rmErr) console.error('storage remove failed (고아 파일 남음):', rmErr, paths);
    }

    // ── 발도장을 지웠으면 파생 집계도 정리 ──────────────────────
    // 트리거는 삽입만 반영하고 삭제는 되돌리지 않는다(실측 확인).
    // 남겨두면 발도장이 없는데 방문 요약·익숙한 강아지 신호가 유령으로 남는다.
    if (targetCheckinId) {
      const { error: rpcErr } = await svc.rpc('cleanup_orphan_visit_data');
      if (rpcErr) console.error('orphan cleanup failed:', rpcErr);
    }

    return Response.json(
      { ok: true, deleted_photos: photoIds.length, deleted_checkin: !!targetCheckinId },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error('delete-checkin-photo error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
