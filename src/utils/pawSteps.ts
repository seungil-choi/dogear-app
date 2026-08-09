/**
 * 발도장 단계 흐름 — 순수 계산만 모아 둔 곳.
 *
 * 왜 화면에서 떼어냈나:
 *   공개 범위 단계를 숨기면서 흐름이 1 → 2 → **4**가 됐는데(3이 빠진다),
 *   "3을 건너뛴다"는 지식이 다음/이전/인디케이터 세 곳에 각자 하드코딩돼 있었다.
 *   인디케이터만 갱신을 빠뜨려 **완료 단계에서 활성 노드가 사라졌다**(전부 체크 표시).
 *   흐름 배열 하나에서 전부 파생시키면 그런 어긋남이 생길 수 없고,
 *   화면을 띄우지 않고도 테스트할 수 있다.
 *
 * step 번호를 다시 매기지 않는 이유: 화면 조건이 번호에 묶여 있다(`step === 2` 등).
 * 번호는 그대로 두고 '순서'만 이 배열이 정한다.
 */

/** 내부 step 번호 → 인디케이터 라벨 */
export const PAW_STEP_LABEL: Record<number, string> = {
  1: '장소',
  2: '느낌',
  3: '공개 범위',
  4: '완료',
};

/** 공개 범위 단계 노출 여부에 따른 전체 흐름 */
export function pawStepFlow(showVisibilityStep: boolean): number[] {
  return showVisibilityStep ? [1, 2, 3, 4] : [1, 2, 4];
}

/**
 * 인디케이터에 그릴 단계.
 * 장소 상세에서 바로 들어오면(preset) 장소 선택 단계는 아예 지나가지 않으므로 뺀다.
 */
export function visiblePawFlow(flow: number[], isPresetSpot: boolean): number[] {
  return isPresetSpot ? flow.filter(n => n !== 1) : flow;
}

/** 흐름상 다음 단계. 마지막이면 undefined. */
export function nextPawStep(flow: number[], step: number): number | undefined {
  const i = flow.indexOf(step);
  return i === -1 ? undefined : flow[i + 1];
}

/** 흐름상 이전 단계. 처음이거나 흐름에 없으면 undefined. */
export function prevPawStep(flow: number[], step: number): number | undefined {
  const i = flow.indexOf(step);
  return i <= 0 ? undefined : flow[i - 1];
}

/**
 * 인디케이터에서 현재 위치(1부터). 흐름에 없는 step이면 1로 떨어뜨린다
 * — 인디케이터가 통째로 비어 보이느니 첫 칸이 켜져 있는 편이 낫다.
 */
export function pawIndicatorIndex(visibleFlow: number[], step: number): number {
  return Math.max(1, visibleFlow.indexOf(step) + 1);
}
