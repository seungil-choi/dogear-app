/**
 * 비밀번호 정책: 8자 이상 / 영문 + 숫자 — 가입·재설정이 같은 기준을 쓴다.
 * 인라인 문구는 마침표를 쓰지 않는다(§3.1)
 */
import { VALID } from '../constants/messages';

export function validatePassword(pw: string): { ok: boolean; reason?: string } {
  if (pw.length < 8) return { ok: false, reason: VALID.passwordShort };
  if (!/[A-Za-z]/.test(pw)) return { ok: false, reason: '비밀번호에 영문을 넣어주세요' };
  if (!/\d/.test(pw)) return { ok: false, reason: '비밀번호에 숫자를 넣어주세요' };
  return { ok: true };
}
