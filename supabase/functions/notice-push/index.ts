/**
 * notice-push Edge Function  (planning/37 공지사항)
 *
 * 게시된 공지를 앱 푸시로 보낸다. 알림함 행은 DB 함수(admin_publish_notice)가 이미 만들었다 —
 * 여기서는 푸시만 한다. 같은 공지로 두 번 보내지 않는다(push_sent_at).
 *
 * 운영자(admin 이상) 전용. 어드민 서버 액션이 운영자 세션으로 functions.invoke 한다.
 *
 * 광고 구분:
 *   - 'event' 분류 = 광고. 앱 푸시 광고 수신 동의(marketing_push)한 회원에게만,
 *     야간(KST 21~08시)에는 야간 수신 동의(marketing_night)까지 한 회원에게만 보낸다(정보통신망법 §50).
 *     제목 앞에 "(광고)"를 붙인다.
 *   - 그 밖의 분류(약관·정책, 서비스, 점검) = 서비스 알림. 광고 동의와 무관하게 보낸다.
 *
 * Request body: { noticeId: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo 한 요청 최대 메시지 수

function isKstNight(now = new Date()): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= 21 || kstHour < 8;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { data: admin } = await svc.from('admins').select('id, status, role').eq('id', user.id).maybeSingle();
    if (!admin || admin.status !== 'active' || !['admin', 'super_admin'].includes(admin.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const { noticeId } = await req.json().catch(() => ({}));
    if (!noticeId) return Response.json({ error: 'noticeId required' }, { status: 400, headers: corsHeaders });

    const { data: notice } = await svc
      .from('notices')
      .select('notice_id, category, title, body, status, push_sent_at')
      .eq('notice_id', noticeId)
      .maybeSingle();
    if (!notice) return Response.json({ error: '공지를 찾을 수 없습니다' }, { status: 404, headers: corsHeaders });
    if (notice.status !== 'published') {
      return Response.json({ error: '게시된 공지만 보낼 수 있습니다' }, { status: 409, headers: corsHeaders });
    }
    if (notice.push_sent_at) {
      return Response.json({ sent: 0, alreadySent: true }, { headers: corsHeaders });
    }

    const isAd = notice.category === 'event';

    // 대상: 활성 회원. 광고면 수신 동의(+야간 동의)로 거른다
    const { data: users } = await svc.from('users').select('user_id').eq('status', 'active');
    let targetIds = (users ?? []).map((u: { user_id: string }) => u.user_id);
    if (isAd && targetIds.length) {
      let q = svc.from('consents').select('user_id').in('user_id', targetIds).eq('marketing_push', true);
      if (isKstNight()) q = q.eq('marketing_night', true);
      const { data: ok } = await q;
      targetIds = (ok ?? []).map((c: { user_id: string }) => c.user_id);
    }

    // 실제 발송 전에 먼저 표시한다 — 중간에 실패해도 두 번째 버튼 클릭이 전원에게 다시 보내지 않게
    const { data: claimed } = await svc
      .from('notices')
      .update({ push_sent_at: new Date().toISOString() })
      .eq('notice_id', noticeId)
      .is('push_sent_at', null)
      .select('notice_id');
    if (!claimed?.length) return Response.json({ sent: 0, alreadySent: true }, { headers: corsHeaders });

    const tokens: string[] = [];
    for (let i = 0; i < targetIds.length; i += 500) {
      const { data: rows } = await svc.from('push_tokens').select('expo_token').in('user_id', targetIds.slice(i, i + 500));
      for (const r of rows ?? []) if (r.expo_token) tokens.push(r.expo_token);
    }

    const title = isAd ? `(광고) ${notice.title}` : notice.title;
    const body = String(notice.body).replace(/\s+/g, ' ').slice(0, 100);
    const messages = [...new Set(tokens)].map((to) => ({
      to, title, body, sound: 'default', channelId: 'default',
      data: { notice_id: notice.notice_id },
    }));

    let failedBatches = 0;
    for (let i = 0; i < messages.length; i += BATCH) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + BATCH)),
      }).catch((e) => { console.error('[notice-push] Expo 요청 실패:', e); return null; });
      if (!res || !res.ok) failedBatches++;
    }

    await svc.from('notices').update({ push_count: messages.length }).eq('notice_id', noticeId);
    await svc.from('admin_action_logs').insert({
      actor_admin_id: user.id, target_type: 'notice', target_id: noticeId, action_type: 'notice_push',
      metadata: { title: notice.title, recipients: targetIds.length, devices: messages.length, failed_batches: failedBatches, ad: isAd },
    });

    return Response.json({ sent: messages.length, recipients: targetIds.length, failedBatches }, { headers: corsHeaders });
  } catch (err) {
    console.error('notice-push error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
