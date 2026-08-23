/**
 * spot-photos Edge Function
 *
 * 장소 사진 전체 보기(`/spot/[id]/photos`)의 페이지 소스.
 * 장소 상세(spot-detail)는 앞 12장만 내려주고, 그 뒤는 여기서 이어 받는다.
 *
 * 왜 클라가 checkin_photos를 직접 안 읽는가:
 *   RLS는 **본인 강아지 사진만** SELECT를 열어준다(공개 갤러리를 클라에 열면
 *   private 사진까지 새어나간 전례가 있다). 공개용 조립은 service_role의 몫이다.
 *
 * 공개 규칙 — spot-detail과 **동일하게 유지해야 한다**. 어긋나면 같은 장소에서
 * 상세와 전체보기가 다른 사진 집합을 보여준다.
 *   · status='visible'          (신고·검수로 내려간 것 제외)
 *   · 발도장이 private이 아님    (사진의 공개범위는 그 발도장을 따른다)
 *   · 차단한 사용자의 강아지 제외 (양방향)
 *   · **강아지 이름을 내보내지 않는다** — 이름이 없어야 spot_only 사진도 공개범위를 지킨다
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const MAX_LIMIT = 60;

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

    const body = await req.json().catch(() => ({}));
    const spotId: string | undefined = body.spotId;
    const dogId: string | null = body.dogId ?? null;
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 30));

    if (!spotId) {
      return Response.json({ error: 'spotId required' }, { status: 400, headers: corsHeaders });
    }

    // 차단 양방향 — 소유주 단위로 걸러낸다
    const { data: blocks } = await supabase.rpc('blocked_counterpart_user_ids');
    const blockedUserIds = new Set((blocks ?? []).map((r: { user_id: string }) => r.user_id));

    // 차단 필터로 줄어드는 만큼 넉넉히 읽고 잘라낸다
    const { data: rows, count } = await svc
      .from('checkin_photos')
      .select('id, image_url, dog_id, created_at, paw_checkins!inner(visibility_level)', { count: 'exact' })
      .eq('spot_id', spotId)
      .eq('status', 'visible')
      .neq('paw_checkins.visibility_level', 'private')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit * 2 - 1);

    let items = rows ?? [];
    if (blockedUserIds.size > 0 && items.length > 0) {
      const dogIds = Array.from(new Set(items.map((p: { dog_id: string }) => p.dog_id)));
      const { data: owners } = await svc.from('dogs').select('dog_id, user_id').in('dog_id', dogIds);
      const ownerByDog: Record<string, string> = {};
      for (const d of owners ?? []) ownerByDog[d.dog_id] = d.user_id;
      items = items.filter((p: { dog_id: string }) => !blockedUserIds.has(ownerByDog[p.dog_id]));
    }

    return Response.json({
      total: count ?? items.length,
      items: items.slice(0, limit).map((p: { id: string; image_url: string; created_at: string; dog_id: string }) => ({
        photo_id: p.id,
        image_url: p.image_url,
        created_at: p.created_at,
        // 삭제를 내줄지 신고를 내줄지 서버가 판정한다 —
        // 클라가 dog_id를 비교하게 하면 남의 강아지 id를 넘겨주게 된다
        is_mine: !!dogId && p.dog_id === dogId,
      })),
    }, { headers: corsHeaders });
  } catch (e) {
    console.error('[spot-photos]', e);
    return Response.json({ error: (e as Error)?.message ?? 'unknown' }, { status: 500, headers: corsHeaders });
  }
});
