/**
 * 네이버 로그인 — 서버 경유 웹 로그인 (2026-10-17, 1.0.2)
 *
 * 앱은 네이버 client secret을 갖지 않는다. 흐름과 이유는 supabase/functions/naver-auth 머리말.
 * 여기서는 verifier/challenge를 만들고, 브라우저를 열고, 돌아온 일회용 code를
 * verifier와 함께 세션으로 바꾼다.
 *
 * 두 플랫폼 모두 verifier를 저장해 두고 dogear://naver-callback 링크로 마무리한다(10/19 iOS도 같은 구조).
 * ⚠️ 안드로이드는 openAuthSessionAsync를 쓰지 않는다(2026-10-18 실기기).
 *   그 함수는 "우리 앱이 다시 앞으로 나오면 취소로 보고 브라우저를 닫는다". 네이버 계정에
 *   '새 기기 로그인 허락'·2단계 인증이 켜져 있으면 로그인 중에 네이버 앱으로 넘어갔다 돌아오는데,
 *   그 순간 로그인 창이 닫혀 서버로 결과가 오지 않았다. 그래서 안드로이드는
 *   ① verifier를 저장해 두고 ② 브라우저를 우리 앱 작업 안에 열고(createTask:false — 네이버 앱에서
 *   돌아오면 우리 앱이 아니라 브라우저가 다시 보인다) ③ dogear://naver-callback 링크가 오면 마무리한다.
 *   앱이 그사이 종료됐다가 링크로 다시 열려도 naver-callback 화면이 저장된 verifier로 마무리한다.
 */
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { SUPABASE_URL } from '../config/env';

const FN = `${SUPABASE_URL}/functions/v1/naver-auth`;
const REDIRECT = 'dogear://naver-callback';
const PENDING_KEY = 'dogear:naver-pending:v1';
/** 저장한 verifier를 믿는 시간 — 서버 교환 코드는 5분, 로그인 허락까지 여유를 둔다 */
const PENDING_TTL_MS = 10 * 60_000;

export type NaverLoginResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed'; detail?: string };

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return globalThis.btoa(s);
}

/** 안드로이드에서 지금 로그인 화면이 결과를 기다리는 중인가 — naver-callback 화면이 중복 처리하지 않게 */
let waiting = false;
export function isNaverLoginWaiting(): boolean {
  return waiting;
}

/** 네이버 버튼을 보여줄지 — 검수 통과 전에는 서버 스위치(app_flags.naver_login)가 꺼져 있다 */
export async function isNaverLoginEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from('app_flags').select('enabled').eq('key', 'naver_login').maybeSingle();
  return !error && data?.enabled === true;
}

async function makePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(bytesToB64(Crypto.getRandomBytes(32)));
  const challenge = b64url(await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 },
  ));
  return { verifier, challenge };
}

/** dogear://naver-callback?... 를 verifier로 세션으로 바꾼다 */
async function finishWith(url: string, verifier: string): Promise<NaverLoginResult> {
  const q = new URL(url).searchParams;
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

/**
 * 저장해 둔 verifier로 콜백 링크를 마무리한다(안드로이드).
 * 로그인 화면이 기다리는 중이면 거기서, 앱이 다시 시작됐으면 naver-callback 화면에서 부른다.
 * 한 번 꺼내면 지운다 — 같은 링크로 두 번 교환하지 않게.
 */
export async function completeNaverCallback(url: string): Promise<NaverLoginResult> {
  let pending: { verifier: string; at: number } | null = null;
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    await AsyncStorage.removeItem(PENDING_KEY);
    pending = raw ? JSON.parse(raw) : null;
  } catch { /* 아래에서 실패 처리 */ }
  if (!pending?.verifier || Date.now() - pending.at > PENDING_TTL_MS) {
    return { ok: false, reason: 'failed', detail: 'no_pending' };
  }
  return finishWith(url, pending.verifier);
}

export async function signInWithNaver(): Promise<NaverLoginResult> {
  const { verifier, challenge } = await makePair();
  const startUrl = `${FN}/start?challenge=${challenge}`;

  // 두 플랫폼 공통: verifier를 저장하고, 돌아오는 링크로 마무리한다.
  // 로그인 중 앱이 종료됐다가 링크로 다시 열려도 naver-callback 화면이 이 값으로 마무리한다.
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, at: Date.now() }));
  waiting = true;

  return new Promise<NaverLoginResult>((resolve) => {
    let done = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: NaverLoginResult) => {
      if (done) return;
      done = true;
      waiting = false;
      linkSub.remove();
      appSub?.remove();
      clearTimeout(cancelTimer);
      clearTimeout(hardTimeout);
      resolve(r);
    };
    const complete = (url: string) => {
      clearTimeout(cancelTimer);
      void completeNaverCallback(url).then(finish, (e) => finish({ ok: false, reason: 'failed', detail: String(e?.message ?? e) }));
    };
    /** 링크가 끝내 안 오면 취소로 본다 — 링크가 앱을 깨우는 경우를 위해 잠깐 기다린다 */
    const cancelSoon = () => {
      clearTimeout(cancelTimer);
      cancelTimer = setTimeout(async () => {
        const still = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
        if (still) {
          await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
          finish({ ok: false, reason: 'cancelled' });
        }
      }, 2500);
    };

    // 콜백 링크가 앱으로 오면 마무리(안드로이드 주 경로, iOS 보조 경로)
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(REDIRECT)) complete(url);
    });

    const hardTimeout = setTimeout(() => {
      void AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
      finish({ ok: false, reason: 'failed', detail: 'timeout' });
    }, PENDING_TTL_MS);

    let appSub: { remove: () => void } | undefined;

    if (Platform.OS === 'android') {
      // 브라우저를 닫고 돌아왔는데(우리 앱이 앞으로) 링크가 안 오면 취소
      appSub = AppState.addEventListener('change', (st) => { if (st === 'active') cancelSoon(); });
      // 우리 앱 작업 안에 연다 — 네이버 앱에서 로그인 허락 후 돌아오면 이 브라우저가 다시 보인다
      WebBrowser.openBrowserAsync(startUrl, { createTask: false }).catch((e) => {
        void AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
        finish({ ok: false, reason: 'failed', detail: `open:${e?.message ?? e}` });
      });
      return;
    }

    // iOS: 시스템 인증 창(ASWebAuthenticationSession). 네이버 앱으로 로그인 허락을 하고 돌아와도 창이
    // 그대로 남아 이어진다. 일반 브라우저 창은 dogear:// 로 돌아올 때 'DogEar에서 열까요?'를 한 번 더 묻는다.
    // 비공개 세션: 남은 네이버 로그인으로 조용히 끝나지 않게, 'supabase.co로 로그인' 경고도 없앤다.
    WebBrowser.openAuthSessionAsync(startUrl, REDIRECT, { preferEphemeralSession: true })
      .then((res) => {
        if (res.type === 'success' && res.url) complete(res.url);
        else cancelSoon();   // 창이 닫혀도 링크가 따로 올 수 있어 잠깐 기다린다
      })
      .catch((e) => {
        void AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
        finish({ ok: false, reason: 'failed', detail: `open:${e?.message ?? e}` });
      });
  });
}
