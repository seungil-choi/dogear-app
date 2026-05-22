/**
 * familiar_layer (산책 친구 찾기) 정책 — SSOT
 *
 * 사용자에게 약속하는 안전 조건과 실제 검증 로직이 분기되지 않도록
 * 이 파일이 단일 진실 공급원입니다.
 *
 * - UI(privacy-settings.tsx): SAFETY_CONDITION_TEXTS import
 * - 클라이언트 검증(utils/rules.ts): FAMILIAR_LAYER_POLICY 상수 import
 * - 서버 검증(Edge Function paw-checkin/index.ts):
 *     Deno 환경이라 TS import 불가 → 같은 값을 코드 상단에 복제 + 주석으로 동기화 약속.
 *     본 파일 값을 바꿀 땐 반드시 서버 측도 함께 수정.
 */

export const FAMILIAR_LAYER_POLICY = {
  /**
   * 양쪽 강아지가 같은 장소를 "최근 방문"으로 인정하는 윈도 (일).
   * familiar_dog_signals.recent_last_seen_at + 본인 강아지 visit 모두 이 기간 내여야 함.
   */
  WINDOW_DAYS: 14,

  /**
   * 본인 강아지가 같은 장소에서 familiar_layer 공개로 체크인한 최소 횟수.
   * 서버 paw-checkin Edge Function에서 N회 이상이면 exposure_allowed=true 부여.
   */
  MIN_FAMILIAR_CHECKIN_COUNT: 2,

  /**
   * 위 횟수를 누적하는 윈도 (일). 서버에서 사용.
   * UI 표시 텍스트도 이 값을 따라야 함.
   */
  MIN_FAMILIAR_CHECKIN_WINDOW_DAYS: 30,
} as const;

/**
 * 사용자에게 노출되는 안전 조건 텍스트 (privacy-settings 화면).
 * 위 정책 값과 동기화되어 있어야 함.
 *
 * 변경 시 약관 (legal/privacy-policy)도 함께 검토.
 */
export const SAFETY_CONDITION_TEXTS: readonly string[] = [
  `두 강아지 모두 최근 ${FAMILIAR_LAYER_POLICY.WINDOW_DAYS}일 안에 같은 장소를 방문했어요`,
  `같은 장소에서 우리 아이의 "산책 친구 찾기" 발도장이 최근 ${FAMILIAR_LAYER_POLICY.MIN_FAMILIAR_CHECKIN_WINDOW_DAYS}일 안에 ${FAMILIAR_LAYER_POLICY.MIN_FAMILIAR_CHECKIN_COUNT}회 이상 쌓였어요`,
  '두 강아지 모두 "산책 친구 찾기에 우리 아이 보여주기"를 켜둔 상태예요',
  '두 강아지 모두 같은 장소에서 친구 찾기 발도장이 만났어요',
] as const;
