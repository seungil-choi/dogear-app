import { pawSubmitLabel } from '../pawSubmitLabel';

const base = {
  submitPhase: null as any,
  isSubmitting: false,
  uploadProgress: null,
  cooldownRemainingMs: 0,
  cooldownMinLeft: 0,
  proximityBlockedReason: null,
};

describe('pawSubmitLabel', () => {
  it('평상시에는 발도장 찍기', () => {
    expect(pawSubmitLabel(base)).toBe('발도장 찍기');
  });

  // 이 테스트가 실제 사고를 막는다: 탭 직후 isSubmitting은 아직 false다.
  it('탭 직후(checking) 이미 저장 중으로 보인다 — isSubmitting이 꺼져 있어도', () => {
    expect(pawSubmitLabel({ ...base, submitPhase: 'checking' })).toBe('저장 중...');
  });

  it('위치 확인 / 저장 단계', () => {
    expect(pawSubmitLabel({ ...base, submitPhase: 'locating' })).toBe('위치 확인 중...');
    expect(pawSubmitLabel({ ...base, submitPhase: 'saving' })).toBe('저장 중...');
    expect(pawSubmitLabel({ ...base, isSubmitting: true })).toBe('저장 중...');
  });

  it('사진 1장이면 개수를 세지 않는다', () => {
    expect(pawSubmitLabel({
      ...base, submitPhase: 'uploading', uploadProgress: { done: 0, total: 1 },
    })).toBe('사진 올리는 중...');
  });

  it('사진 여러 장이면 진행 개수를 보여준다', () => {
    expect(pawSubmitLabel({
      ...base, submitPhase: 'uploading', uploadProgress: { done: 1, total: 3 },
    })).toBe('사진 올리는 중... (1/3)');
  });

  it('진행 중이면 쿨다운·근접 문구를 이긴다', () => {
    expect(pawSubmitLabel({
      ...base, submitPhase: 'locating',
      cooldownRemainingMs: 60_000, cooldownMinLeft: 1,
      proximityBlockedReason: 'too_far',
    })).toBe('위치 확인 중...');
  });

  it('막힌 이유들', () => {
    expect(pawSubmitLabel({ ...base, cooldownRemainingMs: 120_000, cooldownMinLeft: 2 })).toBe('2분 후 가능');
    expect(pawSubmitLabel({ ...base, proximityBlockedReason: 'too_far' })).toBe('장소 근처로 이동해주세요');
    expect(pawSubmitLabel({ ...base, proximityBlockedReason: 'no_location' })).toBe('위치 권한 필요');
    expect(pawSubmitLabel({ ...base, proximityBlockedReason: 'invalid_spot' })).toBe('장소 정보 오류');
    expect(pawSubmitLabel({ ...base, proximityBlockedReason: 'low_accuracy' })).toBe('위치 정확도 부족');
    // 모르는 사유도 조용히 통과시키지 않는다
    expect(pawSubmitLabel({ ...base, proximityBlockedReason: 'something_new' })).toBe('위치 정확도 부족');
  });
});
