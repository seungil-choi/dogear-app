import {
  pawStepFlow, visiblePawFlow, nextPawStep, prevPawStep, pawIndicatorIndex, PAW_STEP_LABEL,
} from '../pawSteps';

const HIDDEN = pawStepFlow(false);  // 현재 Phase 1 — 공개 범위 숨김
const SHOWN  = pawStepFlow(true);   // Phase 2에서 되살렸을 때

describe('pawStepFlow', () => {
  it('공개 범위를 숨기면 3이 빠진다', () => {
    expect(HIDDEN).toEqual([1, 2, 4]);
  });
  it('노출하면 1~4 전부', () => {
    expect(SHOWN).toEqual([1, 2, 3, 4]);
  });
});

describe('다음/이전 이동', () => {
  it('숨김 상태에서 느낌 다음은 완료(3을 건너뛴다)', () => {
    expect(nextPawStep(HIDDEN, 2)).toBe(4);
  });
  it('숨김 상태에서 완료의 이전은 느낌', () => {
    expect(prevPawStep(HIDDEN, 4)).toBe(2);
  });
  it('노출 상태에서는 한 칸씩', () => {
    expect(nextPawStep(SHOWN, 2)).toBe(3);
    expect(prevPawStep(SHOWN, 4)).toBe(3);
  });
  it('마지막에서 다음은 없다', () => {
    expect(nextPawStep(HIDDEN, 4)).toBeUndefined();
  });
  it('처음에서 이전은 없다', () => {
    expect(prevPawStep(HIDDEN, 1)).toBeUndefined();
  });
  it('흐름에 없는 단계(숨긴 3)로는 움직이지 않는다', () => {
    expect(nextPawStep(HIDDEN, 3)).toBeUndefined();
    expect(prevPawStep(HIDDEN, 3)).toBeUndefined();
  });
});

describe('인디케이터 — 라벨 수와 현재 위치가 어긋나지 않는다', () => {
  // 이 불변식이 깨져서 완료 단계에 활성 노드가 사라졌었다.
  it.each([
    ['일반 진입',  false],
    ['장소 상세에서 진입', true],
  ])('%s: 모든 단계에서 위치가 라벨 범위 안에 있다', (_name, isPreset) => {
    const visible = visiblePawFlow(HIDDEN, isPreset as boolean);
    for (const step of visible) {
      const idx = pawIndicatorIndex(visible, step);
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(visible.length);
    }
  });

  it('일반 진입: 장소·느낌·완료 3칸이고 완료는 3번째', () => {
    const visible = visiblePawFlow(HIDDEN, false);
    expect(visible.map(n => PAW_STEP_LABEL[n])).toEqual(['장소', '느낌', '완료']);
    expect(pawIndicatorIndex(visible, 4)).toBe(3);
  });

  it('장소 상세 진입: 느낌·완료 2칸이고 완료는 2번째', () => {
    const visible = visiblePawFlow(HIDDEN, true);
    expect(visible.map(n => PAW_STEP_LABEL[n])).toEqual(['느낌', '완료']);
    expect(pawIndicatorIndex(visible, 2)).toBe(1);
    expect(pawIndicatorIndex(visible, 4)).toBe(2);
  });

  it('Phase 2에서 되살려도 어긋나지 않는다', () => {
    const visible = visiblePawFlow(SHOWN, false);
    expect(visible.map(n => PAW_STEP_LABEL[n])).toEqual(['장소', '느낌', '공개 범위', '완료']);
    expect(pawIndicatorIndex(visible, 4)).toBe(4);
  });
});
