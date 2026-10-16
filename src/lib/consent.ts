/**
 * 서버에 약관 동의 이력이 있는가 — 신규/기존 판별과 동의 강제의 단일 기준.
 *
 * 예전엔 로그인 직후(login.tsx proceedAfterAuth)에서만 확인했다. 그래서 소셜로 새로 가입한 뒤
 * 동의 화면에서 앱을 끄고 다시 켜면, 스플래시가 세션만 보고 동의 없이 앱으로 들여보냈다
 * — consents 없이 위치를 수집하게 되는 구멍(2026-10-16 감사 P0). 스플래시도 같은 함수를 쓴다.
 *
 * 'unknown'은 네트워크 등으로 확인하지 못한 경우다. 그때 앱을 막으면 기존 회원이 갇히므로
 * 들여보내되 서버 오류 기록을 남긴다.
 */
import { supabase } from './supabase';
import { reportError } from '../utils/errorReporter';

export type ConsentState = 'agreed' | 'missing' | 'no-session' | 'unknown';

export async function serverConsentState(): Promise<ConsentState> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return 'no-session';
    const { data, error } = await supabase.from('consents').select('user_id').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return data ? 'agreed' : 'missing';
  } catch (e: any) {
    reportError(new Error(`consent check failed: ${e?.message ?? e}`), 'handled');
    return 'unknown';
  }
}
