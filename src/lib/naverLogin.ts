/**
 * 네이버 로그인 — 서버 경유 웹 로그인 (2026-10-17, 1.0.2)
 *
 * 앱은 네이버 client secret을 갖지 않는다. 흐름과 이유는 supabase/functions/naver-auth 머리말.
 * 여기서는 verifier/challenge를 만들고, 브라우저 인증 세션을 열고, 돌아온 일회용 code를
 * verifier와 함께 세션으로 바꾼다.
 */
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { SUPABASE_URL } from '../config/env';

const FN = `${SUPABASE_URL}/functions/v1/naver-auth`;
const REDIRECT = 'dogear://naver-callback';

export type NaverLoginResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed'; detail?: string };

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return globalThis.btoa(s);
}

/** 네이버 버튼을 보여줄지 — 검수 통과 전에는 서버 스위치(app_flags.naver_login)가 꺼져 있다 */
export async function isNaverLoginEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from('app_flags').select('enabled').eq('key', 'naver_login').maybeSingle();
  return !error && data?.enabled === true;
}

export async function signInWithNaver(): Promise<NaverLoginResult> {
  const verifier = b64url(bytesToB64(Crypto.getRandomBytes(32)));
  const challenge = b64url(await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 },
  ));

  const res = await WebBrowser.openAuthSessionAsync(`${FN}/start?challenge=${challenge}`, REDIRECT);
  if (res.type !== 'success' || !res.url) return { ok: false, reason: 'cancelled' };

  const q = new URL(res.url).searchParams;
  const err = q.get('error');
  if (err) return err === 'cancelled' ? { ok: false, reason: 'cancelled' } : { ok: false, reason: 'failed', detail: err };
  const code = q.get('code');
  if (!code) return { ok: false, reason: 'failed', detail: 'no_code' };

  const ex = await fetch(`${FN}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, verifier }),
  });
  const body = await ex.json().catch(() => ({}));
  if (!ex.ok || !body.token_hash) return { ok: false, reason: 'failed', detail: `exchange:${body.error ?? ex.status}` };

  const { error } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' });
  if (error) return { ok: false, reason: 'failed', detail: `verify:${error.message}` };
  return { ok: true };
}
