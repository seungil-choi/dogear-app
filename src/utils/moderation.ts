/**
 * moderation — UGC 텍스트 사전 필터 (Apple App Store Guideline 1.2)
 *
 * "부적절한 콘텐츠가 게시되지 않도록 필터링" 요건을 충족하기 위한 기본 차단기.
 * 강아지 이름 / 발도장 메모 / 장소 제안 등 타인에게 노출되는 모든 텍스트 입력에 적용.
 *
 * 한계(정직): 결정적 키워드 매칭이라 우회 가능하며 만능이 아니다.
 * 신고(report) + 관리자 삭제 + (이미지는) 모더레이션 큐와 함께 다층 방어의 1차선 역할.
 * 서버(Edge Function) 측에도 동일 검사를 미러링하는 것이 바람직(클라 우회 방지).
 */

// 음란·혐오·폭력·욕설 베이스라인 (한/영). 운영하며 보강 대상.
// ⚠️ 반려견 앱 특성상 오탐 주의: '새끼/보지/자지/씹' 등 단독어는 정상 표현("우리 새끼",
//    "쳐다보지마", "자지러지다", "씹다")과 충돌하므로 명확한 욕설 결합형만 등록한다.
const BANNED_PATTERNS: RegExp[] = [
  // 한국어 욕설/비속 (고정밀)
  /씨발|시발|씨ㅂ|ㅅㅂ|개새끼|니애미|애미뒤|병신|ㅂㅅ|지랄|좆같|좆나|존나|개같|썅놈|썅년/,
  // 혐오/차별
  /꼴페미|김치녀|한남충|틀딱|급식충|똥꼬충|장애인새끼/,
  // 성적 (명시)
  /섹스|\bsex\b|porn|야동|성인물|자위행위|에로영상/i,
  // 영어 욕설/혐오
  /\bfuck|\bshit\b|\bbitch\b|\bcunt\b|\bnigger\b|\bfaggot\b|\bpussy\b/i,
];

/** 입력에서 처음 걸린 금지어 반환, 없으면 null */
export function findBannedWord(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, '');
  for (const re of BANNED_PATTERNS) {
    const m = normalized.match(re) ?? text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** 부적절 텍스트면 true */
export function isObjectionable(text: string | null | undefined): boolean {
  return findBannedWord(text) !== null;
}

/** 사용자 안내용 메시지 */
export const MODERATION_BLOCK_MESSAGE =
  '부적절한 표현이 포함되어 있어요. 다른 표현으로 바꿔주세요.';
