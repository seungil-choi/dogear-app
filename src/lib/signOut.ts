/**
 * 로그아웃 — 서버 세션 종료에 실패해도(오프라인 등) 이 기기 세션은 반드시 지운다.
 *
 * auth-js는 네트워크 오류면 { error }만 돌려주고 저장된 세션을 남긴다. 그러면 로그인 화면이
 * 떴는데도 다음 실행 때 이전 계정으로 조용히 다시 들어간다(공용 폰이면 남의 계정)(2026-10-17 QA).
 */
import { supabase } from './supabase';

export async function signOutEverywhereOrLocal(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}
