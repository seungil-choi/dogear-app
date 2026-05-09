/**
 * 환경 변수 단일 진입점
 *
 * 목적:
 *  - process.env.EXPO_PUBLIC_* 직접 참조를 코드 곳곳에 두지 않음
 *  - "DEV_SEED 모드 vs 실 환경" 분기 한 곳에서 결정 → 데모/실서비스 혼재 사고 차단
 *  - 환경변수 추가 시 이 파일만 수정
 *
 * 사용:
 *   import { IS_REAL_AUTH, IS_DEV_SEED } from '@/config/env';
 */

// ─── 모드 분기 ────────────────────────────────────────────
// EXPO_PUBLIC_DEV_SEED='true' → DEV/데모 시드 모드
// 그 외(undefined, 'false') → 실 Supabase 인증 + 실 데이터
export const IS_DEV_SEED   = process.env.EXPO_PUBLIC_DEV_SEED === 'true';
export const IS_REAL_AUTH  = !IS_DEV_SEED;

// 테스트 환경에서는 둘 다 false로 둘 수도 있음 — 추후 NODE_ENV 분기 시 활용
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── 외부 키 ──────────────────────────────────────────────
export const KAKAO_JS_KEY            = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
export const SUPABASE_URL            = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY       = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID    = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const NAVER_CLIENT_ID         = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
export const NAVER_CLIENT_SECRET     = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';
