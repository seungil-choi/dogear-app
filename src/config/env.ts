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
//
// ⚠️ EXPO_PUBLIC_* 는 빌드 시점에 번들에 그대로 박힌다. APK를 받아 `strings`만 돌려도
//    값이 나온다(실측 확인). 그러므로 여기 있는 값은 전부 "공개된 것"으로 취급할 것.
//    서버에서만 써야 하는 비밀은 Supabase Functions Secrets(Deno.env)에 둔다.
//
//    NAVER_CLIENT_SECRET이 여기 있는 건 실수가 아니라 @react-native-seoul/naver-login이
//    NaverLogin.initialize()에 consumerSecret을 요구하기 때문이다(네이버 모바일 SDK 설계).
//    따라서 추출은 막을 수 없고, 방어는 네이버 개발자센터 쪽에서 한다:
//      · 안드로이드 패키지명 + 서명 키 해시 등록으로 다른 앱에서의 사용 차단
//      · 이 시크릿을 서버 측 네이버 API 호출에 재사용하지 말 것
//    (naver-auth 엣지 함수는 이 값을 쓰지 않고 액세스 토큰만 받아 검증한다)
export const KAKAO_JS_KEY            = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
export const SUPABASE_URL            = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY       = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID    = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const NAVER_CLIENT_ID         = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
export const NAVER_CLIENT_SECRET     = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';
