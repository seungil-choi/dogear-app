/**
 * 소셜 로그인 제공자 세션 정리
 *
 * 왜 필요한가:
 *   Supabase 세션(`supabase.auth.signOut()`)만 끊으면 카카오/구글 **네이티브 SDK 세션은 그대로 남는다.**
 *   그 상태에서 로그인 버튼을 다시 누르면 SDK가 남은 세션으로 즉시 토큰을 발급해
 *   **계정 선택 화면 없이 직전 계정으로 재로그인**된다. 그 결과
 *     - 기기를 물려받은 사람이 이전 소유자 계정으로 들어갈 수 있고
 *     - 사용자가 다른 카카오/구글 계정으로 바꿀 방법이 앱 안에 없다.
 *
 *   그래서 로그아웃·탈퇴 시 제공자 세션까지 함께 끊는다.
 *
 * 주의:
 *   - 실패해도 로그아웃 흐름 자체를 막지 않는다(이미 만료된 세션 등 정상 상황이 있음).
 *   - `unlink`는 **연결 해제**(탈퇴 전용). 다시 쓰려면 동의 절차를 새로 거쳐야 한다.
 */

type SeverOptions = {
  /** true면 연결 자체를 해제한다(탈퇴 시). 기본은 세션만 종료. */
  unlink?: boolean;
};

export async function severSocialSessions(options: SeverOptions = {}): Promise<void> {
  await Promise.allSettled([severKakao(options), severGoogle(options)]);
}

async function severKakao({ unlink }: SeverOptions): Promise<void> {
  try {
    const kakao: any = await import('@react-native-kakao/user').catch(() => null);
    if (!kakao) return;
    if (unlink && typeof kakao.unlink === 'function') {
      await kakao.unlink();
      return;
    }
    if (typeof kakao.logout === 'function') await kakao.logout();
  } catch {
    // 세션이 이미 없으면 SDK가 에러를 던진다 — 무시
  }
}

async function severGoogle({ unlink }: SeverOptions): Promise<void> {
  try {
    const mod: any = await import('@react-native-google-signin/google-signin').catch(() => null);
    const GoogleSignin = mod?.GoogleSignin;
    if (!GoogleSignin) return;
    if (unlink && typeof GoogleSignin.revokeAccess === 'function') {
      await GoogleSignin.revokeAccess();
    }
    if (typeof GoogleSignin.signOut === 'function') await GoogleSignin.signOut();
  } catch {
    // 미로그인 상태 등은 무시
  }
}
