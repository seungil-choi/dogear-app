/**
 * admin-push Edge Function — 어드민에서 직접 쓰는 앱 푸시
 *
 * 운영자(admin 이상) 전용. 어드민 서버 액션이 운영자 세션으로 functions.invoke 한다.
 *
 * 받는 사람:
 *   - test: 보내는 운영자 본인의 앱 계정(users.auth_id = 운영자 auth uid)에게만. 실발송 전 확인용
 *   - all : 활성 회원 전체
 *
 * 광고(kind='ad') — 정보통신망법 §50:
 *   - 앱 푸시 광고 수신 동의(marketing_push)한 회원에게만, 야간(KST 21~08시)엔 야간 동의(marketing_night)까지
 *   - 제목 앞 "(광고)", 본문 끝에 수신거부 방법을 붙인다
 *
 * 누르면 이동할 곳: noticeId(공지 상세) 또는 path(앱 안 경로) 중 하나. 둘 다 없으면 앱만 열린다.
 * 알림함에도 남기기(saveInbox)를 켜면 notifications 행을 함께 만든다(type 'admin_push').
 *
 * Request body:
 *   { title, body, kind: 'service'|'ad', target: 'test'|'all', noticeId?, path?, saveInbox?: boolean }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;
const PATH_RE = /^\/[A-Za-z0-9/_\-]*(\?[A-Za-z0-9_\-=&]*)?$/;
const AD_OPT_OUT = '\n수신거부: 내 정보 > 알림 설정';

function isKstNight(now = new Date()): boolean {
  const h = (now.getUTCHours() + 9) % 24;
  return h >= 21 || h < 8;
}

const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return bad('Unauthorized', 401);

    const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return bad('Unauthorized', 401);

    const { data: admin } = await svc.from('admins').select('id, status, role').eq('id', user.id).maybeSingle();
    if (!admin || admin.status !== 'active' || !['admin', 'super_admin'].includes(admin.role)) {
      return bad('Forbidden', 403);
    }

    const input = await req.json().catch(() => ({}));
    const title = String(input.title ?? '').trim();
    const body = String(input.body ?? '').trim();
    const kind = input.kind === 'ad' ? 'ad' : 'service';
    const target = input.target === 'all' ? 'all' : 'test';
    const noticeId = input.noticeId ? String(input.noticeId) : null;
    const path = input.path ? String(input.path).trim() : null;
    const saveInbox = input.saveInbox !== false;

    if (!title || title.length > 50) return bad('제목은 1~50자로 입력해 주세요');
    if (!body || body.length > 200) return bad('본문은 1~200자로 입력해 주세요');
    if (noticeId && path) return bad('이동할 곳은 공지와 앱 경로 중 하나만 고를 수 있습니다');
    if (path && !PATH_RE.test(path)) return bad('앱 경로는 /로 시작하는 앱 안 주소만 쓸 수 있습니다');
    if (noticeId) {
      const { data: n } = await svc.from('notices').select('status').eq('notice_id', noticeId).maybeSingle();
      if (!n || n.status !== 'published') return bad('게시된 공지만 연결할 수 있습니다');
    }

    // 받는 사람
    let targetIds: string[];
    if (target === 'test') {
      const { data: me } = await svc.from('users').select('user_id').eq('auth_id', user.id).eq('status', 'active');
      targetIds = (me ?? []).map((u: { user_id: string }) => u.user_id);
      if (!targetIds.length) {
        return bad('운영자 계정(같은 구글 계정)으로 앱에 로그인한 기록이 없어 테스트 발송을 할 수 없습니다', 404);
      }
    } else {
      const { data: all } = await svc.from('users').select('user_id').eq('status', 'active');
      targetIds = (all ?? []).map((u: { user_id: string }) => u.user_id);
    }
    if (kind === 'ad' && targetIds.length) {
      let q = svc.from('consents').select('user_id').in('user_id', targetIds).eq('marketing_push', true);
      if (isKstNight()) q = q.eq('marketing_night', true);
      const { data: ok } = await q;
      targetIds = (ok ?? []).map((c: { user_id: string }) => c.user_id);
    }

    const finalTitle = kind === 'ad' ? `(광고) ${title}` : title;
    const finalBody = kind === 'ad' ? body + AD_OPT_OUT : body;
    const data: Record<string, string> = {};
    if (noticeId) data.notice_id = noticeId;
    if (path) data.path = path;

    const { data: camp, error: campErr } = await svc.from('push_campaigns').insert({
      kind, target, title: finalTitle, body: finalBody, notice_id: noticeId, link_path: path,
      save_inbox: saveInbox, recipients: targetIds.length, sent_by: user.id,
    }).select('campaign_id').single();
    if (campErr) throw campErr;

    if (saveInbox && targetIds.length) {
      for (let i = 0; i < targetIds.length; i += 500) {
        const { error } = await svc.from('notifications').insert(
          targetIds.slice(i, i + 500).map((uid) => ({
            user_id: uid, type: 'admin_push', title: finalTitle, body: finalBody,
            data: { ...data, campaign_id: camp.campaign_id },
          })),
        );
        if (error) console.error('[admin-push] 알림함 저장 실패:', error.message);
      }
    }

    const tokens: string[] = [];
    for (let i = 0; i < targetIds.length; i += 500) {
      const { data: rows } = await svc.from('push_tokens').select('expo_token').in('user_id', targetIds.slice(i, i + 500));
      for (const r of rows ?? []) if (r.expo_token) tokens.push(r.expo_token);
    }
    const messages = [...new Set(tokens)].map((to) => ({
      to, title: finalTitle, body: finalBody, sound: 'default', channelId: 'default', data,
    }));

    let failedBatches = 0;
    for (let i = 0; i < messages.length; i += BATCH) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + BATCH)),
      }).catch((e) => { console.error('[admin-push] Expo 요청 실패:', e); return null; });
      if (!res || !res.ok) failedBatches++;
    }

    await svc.from('push_campaigns').update({
      devices: messages.length, failed_batches: failedBatches, finished_at: new Date().toISOString(),
    }).eq('campaign_id', camp.campaign_id);
    await svc.from('admin_action_logs').insert({
      actor_admin_id: user.id, target_type: 'push_campaign', target_id: camp.campaign_id, action_type: 'admin_push',
      metadata: { kind, target, title: finalTitle, recipients: targetIds.length, devices: messages.length, failed_batches: failedBatches },
    });

    return Response.json(
      { campaignId: camp.campaign_id, recipients: targetIds.length, devices: messages.length, failedBatches },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error('admin-push error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
});
