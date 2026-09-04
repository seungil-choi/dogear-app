/**
 * 발도장 버튼 라벨 — 무엇을 기다리는지 말한다.
 *
 * 왜 분리했나: 화면에서 삼항을 6단 겹치니 어느 조건이 이기는지 읽히지 않았다.
 *   순서에 의미가 있다 — **진행 중이 가장 먼저**다. 탭한 뒤에는 쿨다운·근접 문구가
 *   아니라 진행 상태가 보여야 한다.
 *
 * ⚠️ submitPhase가 isSubmitting보다 먼저다. isSubmitting은 서버 호출 구간에서만
 *    켜져서, 탭 직후의 검사·위치확인·업로드 구간을 덮지 못한다.
 *    그 공백 때문에 "눌렸나?" 하고 한 번 더 누르는 일이 있었다.
 */
export type SubmitPhase = null | 'checking' | 'locating' | 'uploading' | 'saving';

export type ProximityReason =
  | 'too_far' | 'no_location' | 'invalid_spot' | 'low_accuracy' | (string & {});

export interface PawSubmitLabelInput {
  submitPhase: SubmitPhase;
  isSubmitting: boolean;
  uploadProgress?: { done: number; total: number } | null;
  cooldownRemainingMs: number;
  cooldownMinLeft: number;
  proximityBlockedReason?: ProximityReason | null;
}

export function pawSubmitLabel({
  submitPhase, isSubmitting, uploadProgress,
  cooldownRemainingMs, cooldownMinLeft, proximityBlockedReason,
}: PawSubmitLabelInput): string {
  // 1) 진행 중 — 다른 무엇보다 먼저
  if (submitPhase === 'locating') return '위치 확인 중...';
  if (submitPhase === 'uploading') {
    return uploadProgress && uploadProgress.total > 1
      ? `사진 올리는 중... (${uploadProgress.done}/${uploadProgress.total})`
      : '사진 올리는 중...';
  }
  if (submitPhase || isSubmitting) return '저장 중...';

  // 2) 누를 수 없는 이유
  if (cooldownRemainingMs > 0) return `${cooldownMinLeft}분 후 가능`;
  switch (proximityBlockedReason) {
    case 'too_far':      return '장소 근처로 이동해주세요';
    case 'no_location':  return '위치 권한 필요';
    case 'invalid_spot': return '장소 정보 오류';
    case null:
    case undefined:      break;
    default:             return '위치 정확도 부족';
  }

  // 3) 누를 수 있다
  return '발도장 찍기';
}
