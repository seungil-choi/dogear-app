/**
 * 런타임 오류 수집 — 앱이 죽거나 예외가 새면 서버에 남긴다.
 *
 * 왜 필요했나:
 *   지금까지 사용자 폰에서 앱이 죽어도 알 방법이 없었다. 유일한 신호가
 *   스토어 리뷰의 별 하나였다. 개발자가 직접 써보다 발견하는 건 사용자가
 *   열 명일 때까지만 통한다.
 *
 * 왜 Sentry가 아닌가:
 *   ① `@sentry/react-native`는 네이티브 모듈이라 지문이 바뀐다 → 설치된 APK가
 *      OTA를 못 받게 되고, 새 빌드 전까지 아무것도 고칠 수 없다.
 *   ② analytics.ts에 "비용 0 원칙: 외부 분석 SDK 의존 X"가 이미 서 있다.
 *   네이티브 크래시(JS를 거치지 않는 것)는 이 방식으로 못 잡는다 —
 *   그건 출시 후 Play Console이 보고한다.
 *
 * ⚠️ **개인정보를 담지 않는다.** 메시지·스택 앞부분·화면 이름까지만.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { IS_REAL_AUTH } from '../config/env';

/** 스택은 앞부분만. 길면 개인정보가 섞일 여지도 커진다. */
const MAX_STACK = 4000;
const MAX_MESSAGE = 500;

/** 같은 오류가 루프를 돌며 서버를 때리는 것을 막는다 */
const RECENT_TTL_MS = 60_000;
const recent = new Map<string, number>();

/** 현재 화면 — 라우터가 갱신한다. 없으면 unknown */
let currentScreen: string | null = null;
export function setErrorScreen(name: string | null) {
  currentScreen = name;
}

function seenRecently(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > RECENT_TTL_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

export async function reportError(
  err: unknown,
  // 'handled' = 잡아서 처리했지만 서버에 남겨야 하는 실패(푸시 등록·로그인 등).
  //   콘솔은 운영 빌드에서 아무도 못 본다 — 조용한 실패가 몇 달씩 묻혔다(푸시 토큰 0건, 2026-10-16).
  kind: 'global' | 'promise' | 'boundary' | 'handled' = 'global',
  isFatal = false,
) {
  try {
    const e = err as Error | undefined;
    const message = String(e?.message ?? err ?? 'unknown').slice(0, MAX_MESSAGE);
    const stack = e?.stack ? String(e.stack).slice(0, MAX_STACK) : null;

    // 개발 중에는 콘솔이 이미 다 보여준다 — 서버를 더럽히지 않는다
    if (!IS_REAL_AUTH) {
      // eslint-disable-next-line no-console
      console.error(`[errorReporter:${kind}]`, message);
      return;
    }
    if (seenRecently(`${kind}:${message}`)) return;

    const row = buildRow(kind, message, stack, isFatal);
    // getUser()는 네트워크 왕복이라 치명 오류 때 앱이 죽기 전에 못 끝났다 — 저장된 세션만 본다
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('client_errors').insert({ ...row, user_id: session?.user?.id ?? null });
    // 수집기가 조용히 죽으면 "오류가 없는 것"처럼 보인다 — 가장 나쁜 실패다.
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[errorReporter] 전송 실패:', error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[errorReporter] 자체 오류:', e);
  }
}

type ErrorRow = {
  source: 'app'; kind: string; message: string; stack: string | null; screen: string | null;
  app_version: string | null; platform: string; os_version: string; is_fatal: boolean;
};
function buildRow(kind: string, message: string, stack: string | null, isFatal: boolean): ErrorRow {
  return {
    source: 'app', kind, message, stack, screen: currentScreen,
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS, os_version: String(Platform.Version ?? ''), is_fatal: isFatal,
  };
}

/**
 * 치명 오류는 앱이 곧 죽는다 — 전송이 끝나기 전에 프로세스가 사라져 거의 다 유실됐다(2026-10-16 감사).
 * 먼저 기기에 적어 두고, 다음 실행 때 보낸다.
 */
const PENDING_KEY = 'dogear:pending-fatal-errors:v1';
async function stashFatal(row: ErrorRow) {
  try {
    const cur = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? '[]');
    cur.push({ ...row, at: new Date().toISOString() });
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(cur.slice(-5)));
  } catch { /* 저장 실패는 어쩔 수 없다 */ }
}
async function flushPendingFatal() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as (ErrorRow & { at?: string })[];
    if (!rows.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('client_errors').insert(
      rows.map(({ at, ...r }) => ({ ...r, message: `${r.message}${at ? ` (crashed ${at})` : ''}`.slice(0, MAX_MESSAGE), user_id: session?.user?.id ?? null })),
    );
    if (!error) await AsyncStorage.removeItem(PENDING_KEY);
  } catch { /* 다음 실행에 다시 */ }
}

/**
 * 앱 시작 시 1회. 전역 핸들러를 가로채되 **원래 동작을 막지 않는다** —
 * 여기서 삼키면 개발 중 빨간 화면이 안 뜨고 릴리스에선 죽어야 할 게 안 죽는다.
 */
let installed = false;
export function installErrorReporter() {
  if (installed) return;
  installed = true;

  // 지난 실행에서 죽기 직전에 적어 둔 치명 오류를 보낸다
  if (IS_REAL_AUTH) void flushPendingFatal();

  // ① 잡히지 않은 JS 예외
  const g = (globalThis as any).ErrorUtils;
  if (g?.getGlobalHandler && g?.setGlobalHandler) {
    const prev = g.getGlobalHandler();
    g.setGlobalHandler((err: any, isFatal?: boolean) => {
      if (isFatal && IS_REAL_AUTH) {
        const e = err as Error | undefined;
        const row = buildRow('global', String(e?.message ?? err ?? 'unknown').slice(0, MAX_MESSAGE),
          e?.stack ? String(e.stack).slice(0, MAX_STACK) : null, true);
        // 기기에 먼저 적고, 기록할 시간을 아주 조금 준 뒤 원래 동작(앱 종료)으로 넘긴다
        void stashFatal(row);
        setTimeout(() => prev?.(err, isFatal), 300);
        return;
      }
      void reportError(err, 'global', !!isFatal);
      prev?.(err, isFatal);
    });
  }

  // ② 처리되지 않은 Promise 거부
  //    Hermes는 unhandledrejection 이벤트를 주지 않는다. 예전 판정식(__DEV__ === undefined)은
  //    운영에서 늘 거짓이라 아무것도 수집하지 않았다(2026-10-16 감사) → Hermes 전용 추적기를 켠다.
  const hermes = (globalThis as any).HermesInternal;
  //    개발 중에는 RN(LogBox)이 같은 추적기를 쓰므로 덮어쓰지 않는다.
  if (!__DEV__ && hermes?.enablePromiseRejectionTracker) {
    try {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (_id: number, rejection: unknown) => { void reportError(rejection, 'promise', false); },
        onHandled: () => {},
      });
    } catch { /* 지원 안 하는 빌드 */ }
  } else if (typeof (globalThis as any).addEventListener === 'function') {
    try {
      (globalThis as any).addEventListener('unhandledrejection', (ev: any) => {
        void reportError(ev?.reason ?? ev, 'promise', false);
      });
    } catch {
      // 지원 안 하는 런타임 — 전역 핸들러만으로 간다
    }
  }
}
