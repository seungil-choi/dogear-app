/**
 * useConsentRecheck — 서버 동의 확인이 실패한 채로 앱에 들어온 경우 다시 확인한다.
 *
 * 스플래시·로그인에서 동의 확인이 시간 초과나 오프라인으로 'unknown'/'no-session'이면
 * serverConsentOk=false로 들어오고, 그대로면 그 실행 내내 위치·주변 장소가 꺼져 있었다
 * (QA 2사이클 10/17). 로그인돼 있는데 아직 확인이 안 됐으면 앱 복귀 때와 30초마다(최대 10번) 다시 본다.
 * 'agreed'가 나오면 켠다. 'missing'이면 그대로 둔다(동의 화면 유도는 스플래시 몫).
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { serverConsentState } from '../lib/consent';

const MAX_TRIES = 10;

export function useConsentRecheck() {
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const serverConsentOk = useAppStore(s => s.serverConsentOk);
  const busy = useRef(false);
  const tries = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || serverConsentOk) { tries.current = 0; return; }

    const check = async () => {
      if (busy.current || tries.current >= MAX_TRIES) return;
      const st = useAppStore.getState();
      if (!st.isAuthenticated || st.serverConsentOk) return;
      busy.current = true;
      tries.current += 1;
      try {
        if ((await serverConsentState()) === 'agreed') useAppStore.getState().setServerConsentOk(true);
      } finally {
        busy.current = false;
      }
    };

    // 첫 확인은 스플래시·로그인이 막 끝났을 수 있어 조금 뒤에
    const first = setTimeout(check, 5_000);
    const timer = setInterval(check, 30_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => { clearTimeout(first); clearInterval(timer); sub.remove(); };
  }, [isAuthenticated, serverConsentOk]);
}
