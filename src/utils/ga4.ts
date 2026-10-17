/**
 * GA4(Google Analytics for Firebase) — 앱 이용 통계 (2026-10-17, 1.0.2)
 *
 * 무엇을 보내나
 *   analytics.track()이 Supabase events에 쌓는 이벤트를 **이름과 화면 정도만** GA4에도 보낸다.
 *   장소 ID·지역·거리·메모 같은 값은 보내지 않는다(아래 PARAM_ALLOWLIST). 화면 이동은
 *   라우트 이름만 보낸다 — 실제 경로에는 장소 ID가 들어 있어서 쓰지 않는다.
 *
 * 언제 켜지나 — 셋을 모두 만족할 때만
 *   ① 안드로이드 실서비스 빌드(iOS는 아직 연결하지 않았다 — package.json expo.autolinking 참고)
 *   ② 개정 처리방침 시행일(GA4_START) 이후. 처리방침에 적기 전에 보내면 안 된다.
 *   ③ 이용자가 [약관 및 정책 > 앱 이용 분석]을 끄지 않았다.
 *   기본값은 꺼짐(firebase.json analytics_auto_collection_enabled=false)이고, 위 조건을
 *   확인한 뒤에 여기서 켠다.
 *
 * 광고 식별자: 수집하지 않는다(firebase.json adid/ssaid=false, app.json AD_ID 권한 제거).
 * 처리방침 문안과 짝이다 — 보내는 항목을 늘리면 처리방침 1절·11절도 함께 고친다.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_REAL_AUTH } from '../config/env';

/** 개정 처리방침 시행일(2026.10.25 00:00 KST). 처리방침 화면의 시행일과 같아야 한다 */
export const GA4_START = Date.parse('2026-10-25T00:00:00+09:00');

const OPT_OUT_KEY = 'dogear:ga4-opt-out:v1';

/** GA4로 보내도 되는 속성 — 장소에 관한 값(분류 포함)은 넣지 않는다. 처리방침 11절① "조회한 장소… 보내지 않습니다"와 짝 */
const PARAM_ALLOWLIST = ['screen_name', 'source_screen'] as const;

/** 이 빌드에서 GA4를 쓸 수 있는가(시행일·이용자 설정과 무관한 조건) */
export const GA4_SUPPORTED = Platform.OS === 'android' && IS_REAL_AUTH && !__DEV__;

let mod: any = null;
let analytics: any = null;
let enabled = false;
let reportedFailure = false;

function fail(stage: string, e: unknown) {
  if (reportedFailure) return;
  reportedFailure = true;
  // 순환 import를 피하려고 실패할 때만 불러온다
  const { reportError } = require('./errorReporter');
  void reportError(new Error(`[ga4] ${stage} failed: ${(e as any)?.message ?? e}`), 'handled');
}

function load(): boolean {
  if (!GA4_SUPPORTED) return false;
  if (analytics) return true;
  try {
    mod = require('@react-native-firebase/analytics');
    analytics = mod.getAnalytics();
    return true;
  } catch (e) {
    fail('load', e);
    return false;
  }
}

export async function getGa4OptOut(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OPT_OUT_KEY)) === '1';
  } catch {
    return false;
  }
}

/** 지금 조건으로 수집을 켜거나 끈다. 앱 시작 때와 설정을 바꿀 때 부른다 */
export async function applyGa4Collection(): Promise<void> {
  if (!load()) return;
  const want = Date.now() >= GA4_START && !(await getGa4OptOut());
  try {
    if (want) {
      // 광고 저장·광고 사용자 데이터·개인 맞춤 광고 신호는 쓰지 않는다
      await mod.setConsent(analytics, {
        analytics_storage: true,
        ad_storage: false,
        ad_user_data: false,
        ad_personalization: false,
      });
    }
    await mod.setAnalyticsCollectionEnabled(analytics, want);
    enabled = want;
  } catch (e) {
    enabled = false;
    fail('setCollection', e);
  }
}

export async function setGa4OptOut(optOut: boolean): Promise<void> {
  try {
    if (optOut) await AsyncStorage.setItem(OPT_OUT_KEY, '1');
    else await AsyncStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* 저장 실패해도 이번 실행에는 아래에서 반영한다 */
  }
  if (optOut) {
    enabled = false;
    if (load()) {
      try { await mod.setAnalyticsCollectionEnabled(analytics, false); } catch (e) { fail('optOut', e); }
    }
    return;
  }
  await applyGa4Collection();
}

/** GA4 이벤트 이름 규칙(영문·숫자·밑줄, 40자) — 우리 이벤트는 이미 맞지만 방어한다 */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);
}

export function ga4Event(name: string, props: Record<string, unknown> = {}): void {
  if (!enabled || !analytics) return;
  const params: Record<string, string> = {};
  for (const k of PARAM_ALLOWLIST) {
    const v = props[k];
    if (typeof v === 'string' && v) params[k] = v.slice(0, 100);
  }
  // RNFB는 예약된 이름(error, session_start…)이면 동기로 던진다 — 호출한 화면까지 번지지 않게 막는다
  try {
    mod.logEvent(analytics, safeName(name), params).catch((e: unknown) => fail('logEvent', e));
  } catch (e) {
    fail('logEvent', e);
  }
}

/**
 * 화면 이동 — expo-router 세그먼트로 만든 라우트 이름만 보낸다.
 * 예: ['(tabs)', 'map'] → 'map', ['spot', '[id]'] → 'spot/[id]'
 */
export function ga4Screen(segments: readonly string[]): void {
  if (!enabled || !analytics) return;
  const name = segments.filter(s => !(s.startsWith('(') && s.endsWith(')'))).join('/') || 'index';
  try {
    mod.logEvent(analytics, 'screen_view', { screen_name: name.slice(0, 100), screen_class: name.slice(0, 100) })
      .catch((e: unknown) => fail('screenView', e));
  } catch (e) {
    fail('screenView', e);
  }
}
