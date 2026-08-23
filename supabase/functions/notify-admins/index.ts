/**
 * notify-admins — 운영자에게 "지금 볼 것이 생겼다"를 알린다.
 *
 * 왜 필요했나:
 *   신고가 들어와도 운영자가 **어드민을 열어봐야** 알 수 있었다.
 *   정책 18번에 신고 처리 SLA를 써뒀는데 지킬 수단이 없었다.
 *   새벽에 불법촬영물 신고가 오면 아침까지 그대로 노출된다.
 *
 * 왜 send-push를 직접 부르지 않나:
 *   send-push는 `Authorization: Bearer <SERVICE_ROLE_KEY>`를 요구한다.
 *   그 키를 DB 트리거 함수 본문에 박으면 pg_proc를 읽을 수 있는 누구에게나 노출된다.
 *   여기서는 이미 쓰고 있는 약한 공유 비밀(x-cron-secret)만 받고,
 *   강한 키는 엣지 함수 환경변수에만 둔다.
 *
 * 실패를 삼키지 않는다:
 *   트리거가 pg_net으로 부르므로 실패해도 호출부가 모른다. 게다가 pg_net 응답은
 *   6시간이면 지워진다. 그래서 실패를 client_errors에 남겨 **어드민 '오류' 화면에
 *   뜨게** 한다. 알림이 죽은 걸 모르는 게 알림이 없는 것보다 나쁘다.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface Body {
  /** 'report' | 'appeal' | 'moderation' */
  kind: string;
  title: string;
  body: string;
  /** 어드민에서 열 경로 (예: /reports/gallery/<id>) */
  path?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  }

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const fail = async (message: string) => {
    // eslint-disable-next-line no-console
    console.error('[notify-admins]', message);
    await svc.from('client_errors').insert({
      source: 'admin', kind: 'action', message: `notify-admins: ${message}`,
      screen: 'notify-admins', platform: 'edge', is_fatal: false,
    });
  };

  try {
    const payload = (await req.json()) as Body;
    if (!payload?.title || !payload?.body) {
      await fail('title/body 누락');
      return Response.json({ error: 'title, body required' }, { status: 400, headers: corsHeaders });
    }

    // 활성 운영자 → 앱 계정(users.auth_id = admins.id) → 푸시 토큰
    const { data: admins, error: aErr } = await svc
      .from('admins').select('id').eq('status', 'active');
    if (aErr) { await fail(`운영자 조회 실패: ${aErr.message}`); throw aErr; }

    const authIds = (admins ?? []).map((a: { id: string }) => a.id);
    if (authIds.length === 0) {
      await fail('활성 운영자가 없다');
      return Response.json({ sent: 0 }, { headers: corsHeaders });
    }

    const { data: users, error: uErr } = await svc
      .from('users').select('user_id').in('auth_id', authIds);
    if (uErr) { await fail(`운영자 앱계정 조회 실패: ${uErr.message}`); throw uErr; }

    const userIds = (users ?? []).map((u: { user_id: string }) => u.user_id);
    if (userIds.length === 0) {
      // 운영자가 앱을 안 깔았거나 계정을 연결 안 한 상태 — 조용히 넘어가면 영영 모른다
      await fail('운영자의 앱 계정이 없다 — 푸시로 알릴 수 없다');
      return Response.json({ sent: 0, reason: 'no_app_account' }, { headers: corsHeaders });
    }

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        userIds,
        title: payload.title,
        body: payload.body,
        data: { admin: true, kind: payload.kind, path: payload.path ?? null },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { await fail(`send-push ${res.status}: ${JSON.stringify(out).slice(0, 200)}`); }
    // 토큰이 0개면 send-push가 200 + sent:0을 준다 — 이것도 "알림이 안 간 것"이라 남긴다
    else if (out?.sent === 0) { await fail('운영자 푸시 토큰이 없다 — 앱에서 알림을 허용해야 한다'); }

    return Response.json({ ok: res.ok, ...out }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
