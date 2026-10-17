/**
 * Edge Function: naver-auth — 네이버 로그인 (서버 경유 웹 로그인, 2026-10-17)
 *
 * 왜 이 방식인가 (SEC-07 해소)
 *   예전 구현은 앱이 네이버 SDK로 받은 access token을 그대로 넘겼다. 그 토큰이 "우리 앱"에서
 *   발급된 것인지 확인할 방법이 없어(audience 미검증) 다른 앱의 토큰으로 남의 계정을 가져갈 수
 *   있었고, SDK는 client secret을 앱 번들에 요구했다. 그래서 410 스텁으로 막아 두었다.
 *   이제는 **authorization code를 서버가 secret으로 교환**한다. 교환이 성공했다는 것 자체가
 *   우리 client_id로 발급됐다는 증명이고, secret은 앱에 없다.
 *
 * 흐름
 *   1. 앱: verifier(무작위) → challenge = base64url(sha256(verifier))
 *      브라우저로 GET /naver-auth/start?challenge=…
 *   2. start: 네이버 동의 화면으로 302 (state = challenge)
 *   3. 네이버 → GET /naver-auth/callback?code&state
 *      code를 secret으로 교환 → /v1/nid/me로 고유 ID → Supabase 사용자 생성(없으면)
 *      → magiclink token_hash 발급 → oauth_exchanges에 (일회용 code, challenge)로 보관
 *      → dogear://naver-callback?code=… 로 302
 *   4. 앱: POST /naver-auth/exchange { code, verifier } → sha256(verifier)==challenge면
 *      { email, token_hash } → supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
 *   dogear:// 링크를 다른 앱이 가로채도 verifier가 없으면 3의 code는 쓸모가 없다.
 *
 * 개인정보: 네이버에서 받는 것은 고유 식별자(id)뿐이다. 이메일·이름은 요청·저장하지 않는다.
 *   계정 이메일은 `naver_{id}@naver.local`(합성)이라 다른 로그인 수단의 계정과 섞이지 않는다
 *   — 네이버의 연락처 이메일은 본인 확인이 안 된 값일 수 있어 그걸로 기존 계정에 붙이면
 *   계정 탈취 통로가 된다.
 *
 * 배포: --no-verify-jwt (브라우저 리다이렉트·네이버 콜백에는 JWT가 없다)
 * 시크릿: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (Supabase Secrets) + 자동 주입 SUPABASE_*
 * 네이버 개발자센터 Callback URL: {SUPABASE_URL}/functions/v1/naver-auth/callback
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const CLIENT_ID = Deno.env.get('NAVER_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('NAVER_CLIENT_SECRET') ?? '';
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/naver-auth/callback`;
const APP_REDIRECT = 'dogear://naver-callback';
const EXCHANGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

const admin = () => createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const toApp = (params: Record<string, string>) =>
  new Response(null, { status: 302, headers: { Location: `${APP_REDIRECT}?${new URLSearchParams(params)}` } });

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256b64url(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(d));
}

function randomCode(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

// ── 1. start ────────────────────────────────────────────────
function start(url: URL): Response {
  const challenge = url.searchParams.get('challenge') ?? '';
  if (!CHALLENGE_RE.test(challenge)) return toApp({ error: 'bad_request' });
  if (!CLIENT_ID || !CLIENT_SECRET) return toApp({ error: 'not_configured' });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    state: challenge,
  });
  return new Response(null, { status: 302, headers: { Location: `https://nid.naver.com/oauth2.0/authorize?${q}` } });
}

// ── 2. callback ─────────────────────────────────────────────
async function callback(url: URL): Promise<Response> {
  const err = url.searchParams.get('error');
  if (err) return toApp({ error: err === 'access_denied' ? 'cancelled' : 'naver_error' });

  const code = url.searchParams.get('code') ?? '';
  const challenge = url.searchParams.get('state') ?? '';
  if (!code || !CHALLENGE_RE.test(challenge)) return toApp({ error: 'bad_request' });

  // code → access token (secret은 여기서만 쓴다)
  const tq = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    state: challenge,
  });
  const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${tq}`);
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) {
    console.error('naver token exchange failed:', token.error, token.error_description);
    return toApp({ error: 'naver_error' });
  }

  const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const me = await meRes.json().catch(() => ({}));
  const naverId = me?.resultcode === '00' ? String(me.response?.id ?? '') : '';
  if (!naverId) {
    console.error('naver profile failed:', me?.resultcode, me?.message);
    return toApp({ error: 'naver_error' });
  }

  const sb = admin();
  const email = `naver_${naverId}@naver.local`;

  // 없으면 만든다. 이미 있으면(email_exists) 그대로 진행.
  const { data: created, error: createError } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { provider: 'naver' },
    app_metadata: { provider: 'naver', providers: ['naver'] },
  });
  if (createError) {
    const exists = (createError as any).code === 'email_exists' || (createError as any).status === 422
      || /already|registered|exists/i.test(createError.message ?? '');
    if (!exists) { console.error('createUser failed:', createError.message); return toApp({ error: 'server_error' }); }
  } else if (created?.user) {
    // 가입 트리거는 provider를 apple/google/email만 안다 → 네이버로 바로잡는다
    await sb.from('users').update({ login_type: 'naver' }).eq('auth_id', created.user.id);
  }

  const { data: link, error: linkError } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = (link as any)?.properties?.hashed_token;
  if (linkError || !tokenHash) { console.error('generateLink failed:', linkError?.message); return toApp({ error: 'server_error' }); }

  const exchangeCode = randomCode();
  const { error: insError } = await sb.from('oauth_exchanges').insert({
    code: exchangeCode, challenge, email, token_hash: tokenHash,
  });
  if (insError) { console.error('exchange insert failed:', insError.message); return toApp({ error: 'server_error' }); }

  // 오래된 교환 기록 정리(하루 지난 것)
  await sb.from('oauth_exchanges').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());

  return toApp({ code: exchangeCode });
}

// ── 3. exchange ─────────────────────────────────────────────
async function exchange(req: Request): Promise<Response> {
  const { code, verifier } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) {
    return json({ error: 'bad_request' }, 400);
  }
  const sb = admin();
  const challenge = await sha256b64url(verifier);
  const since = new Date(Date.now() - EXCHANGE_TTL_MS).toISOString();
  // 한 번만 쓰이도록 조건부 갱신으로 집어 간다(동시 요청 경합 방지)
  const { data, error } = await sb.from('oauth_exchanges')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code).eq('challenge', challenge).is('used_at', null).gte('created_at', since)
    .select('email, token_hash')
    .maybeSingle();
  if (error) { console.error('exchange failed:', error.message); return json({ error: 'server_error' }, 500); }
  if (!data) return json({ error: 'invalid_or_expired' }, 400);
  return json({ email: data.email, token_hash: data.token_hash });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.split('/').pop();
  try {
    if (req.method === 'GET' && route === 'start') return start(url);
    if (req.method === 'GET' && route === 'callback') return await callback(url);
    if (req.method === 'POST' && route === 'exchange') return await exchange(req);
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('naver-auth error:', (e as Error)?.message ?? e);
    return route === 'exchange' ? json({ error: 'server_error' }, 500) : toApp({ error: 'server_error' });
  }
});
