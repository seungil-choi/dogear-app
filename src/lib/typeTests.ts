/**
 * 유형 테스트 (planning/34 1장, 1.1)
 *
 * - 테스트 목록은 원격 목록 파일에서 읽는다 — 테스트를 늘릴 때 앱 업데이트 없이 파일만 고친다.
 *   마지막으로 받은 목록을 기기에 남겨 두고, 못 받으면 그걸 쓴다.
 * - 결과는 강아지 단위로 쌓는다(이력). 화면은 테스트별 최신 1건만 쓴다.
 * - 결과 키는 바꾸지 않는다(DB 체크 제약이 같은 목록을 갖고 있다).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const TYPE_TEST_MANIFEST_URL = 'https://dogear-type.vercel.app/type/manifest.json';
const CACHE_KEY = 'dogear:type-test-manifest:v1';

export type TypeTestStatus = 'live' | 'soon';

export interface TypeTestResultInfo {
  name: string;
  image: string;
}

export interface TypeTest {
  key: string;
  title: string;
  subtitle?: string;
  url?: string;
  thumbnail?: string;
  status: TypeTestStatus;
  results?: Record<string, TypeTestResultInfo>;
}

export interface DogTypeResult {
  result_id: string;
  dog_id: string;
  test_key: string;
  result_key: string;
  detail: Record<string, unknown>;
  created_at: string;
}

/** 웹 테스트가 앱에 넘기는 메시지 (dogear-type app.js / happiness/app.mjs의 toApp) */
export type TypeTestMessage =
  | { type: 'result'; test: string; result: string; detail?: Record<string, unknown>; version?: string }
  | { type: 'image'; action: 'save' | 'share'; dataUrl: string; fileName?: string }
  | { type: 'share-link'; url: string; text?: string };

function isValidManifest(m: any): m is { tests: TypeTest[] } {
  return !!m && Array.isArray(m.tests) && m.tests.every((t: any) => typeof t?.key === 'string' && typeof t?.title === 'string');
}

let memo: TypeTest[] | null = null;

/** 원격 목록 → 실패하면 기기에 남긴 마지막 목록 → 그것도 없으면 throw */
export async function loadTypeTests(force = false): Promise<TypeTest[]> {
  if (memo && !force) return memo;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(TYPE_TEST_MANIFEST_URL, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const json = await res.json();
    if (!isValidManifest(json)) throw new Error('manifest 형식 오류');
    memo = json.tests;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(json)).catch(() => {});
    return memo;
  } catch (e) {
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    if (cached) {
      const json = JSON.parse(cached);
      if (isValidManifest(json)) { memo = json.tests; return memo; }
    }
    throw e;
  }
}

/** 강아지들의 테스트별 최신 결과 — { [dog_id]: { [test_key]: result } } */
export async function fetchLatestResults(dogIds: string[]): Promise<Record<string, Record<string, DogTypeResult>>> {
  const out: Record<string, Record<string, DogTypeResult>> = {};
  if (!dogIds.length) return out;
  const { data, error } = await supabase
    .from('dog_type_results')
    .select('result_id, dog_id, test_key, result_key, detail, created_at')
    .in('dog_id', dogIds)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  for (const r of (data ?? []) as DogTypeResult[]) {
    out[r.dog_id] ??= {};
    if (!out[r.dog_id][r.test_key]) out[r.dog_id][r.test_key] = r;   // 최신순이라 처음 본 게 최신
  }
  return out;
}

export async function saveTypeResult(dogId: string, msg: Extract<TypeTestMessage, { type: 'result' }>): Promise<string> {
  const { data, error } = await supabase.rpc('save_dog_type_result', {
    p_dog_id: dogId,
    p_test_key: msg.test,
    p_result_key: msg.result,
    p_detail: msg.detail ?? {},
    p_content_version: msg.version ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** 앱 웹뷰로 열 주소 — 웹 테스트는 ?app=1일 때만 앱으로 결과를 넘긴다 */
export function inAppUrl(test: TypeTest): string | null {
  if (!test.url) return null;
  const u = test.url.includes('?') ? `${test.url}&app=1` : `${test.url}?app=1`;
  return `${u}&utm_source=app&utm_medium=inapp&utm_campaign=${test.key}`;
}

/** 결과 이름 — 목록에 없으면(목록이 옛 버전) 키를 그대로 */
export function resultName(test: TypeTest | undefined, resultKey: string): string {
  return test?.results?.[resultKey]?.name ?? resultKey;
}
