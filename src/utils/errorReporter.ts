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
  kind: 'global' | 'promise' | 'boundary' = 'global',
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

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('client_errors').insert({
      source: 'app',
      kind,
      message,
      stack,
      screen: currentScreen,
      app_version: Constants.expoConfig?.version ?? null,
      platform: Platform.OS,
      os_version: String(Platform.Version ?? ''),
      is_fatal: isFatal,
      user_id: user?.id ?? null,
    });
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

/**
 * 앱 시작 시 1회. 전역 핸들러를 가로채되 **원래 동작을 막지 않는다** —
 * 여기서 삼키면 개발 중 빨간 화면이 안 뜨고 릴리스에선 죽어야 할 게 안 죽는다.
 */
let installed = false;
export function installErrorReporter() {
  if (installed) return;
  installed = true;

  // ① 잡히지 않은 JS 예외
  const g = (globalThis as any).ErrorUtils;
  if (g?.getGlobalHandler && g?.setGlobalHandler) {
    const prev = g.getGlobalHandler();
    g.setGlobalHandler((err: any, isFatal?: boolean) => {
      void reportError(err, 'global', !!isFatal);
      prev?.(err, isFatal);
    });
  }

  // ② 처리되지 않은 Promise 거부
  //    RN Hermes는 이 이벤트를 표준으로 주지 않아 폴리필이 있을 때만 붙는다.
  const tracking = (globalThis as any).HermesInternal
    ? (globalThis as any).__DEV__ === undefined
    : true;
  if (tracking && typeof (globalThis as any).addEventListener === 'function') {
    try {
      (globalThis as any).addEventListener('unhandledrejection', (ev: any) => {
        void reportError(ev?.reason ?? ev, 'promise', false);
      });
    } catch {
      // 지원 안 하는 런타임 — 전역 핸들러만으로 간다
    }
  }
}
