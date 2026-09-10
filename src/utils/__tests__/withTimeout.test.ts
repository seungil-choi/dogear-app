/**
 * 「현위치」 버튼이 죽어 보이던 원인이 여기였다(2026-09-10).
 * expo-location에 타임아웃 옵션이 없어 실내에서 영영 안 돌아왔고,
 * 그동안 버튼은 disabled로 잠겨 있었다. 이 헬퍼가 그 무한 대기를 끊는다.
 */

import { withTimeout, isTimeout, TimeoutError } from '../withTimeout';

jest.useFakeTimers();

describe('withTimeout', () => {
  it('제 시간에 끝나면 결과를 그대로 돌려준다', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('원본이 실패하면 그 오류를 그대로 전달한다 (타임아웃으로 뭉개지 않는다)', async () => {
    const boom = new Error('권한 없음');
    await expect(withTimeout(Promise.reject(boom), 1000)).rejects.toBe(boom);
  });

  it('시간을 넘기면 TimeoutError로 거절한다 — 영영 매달리지 않는다', async () => {
    const never = new Promise<string>(() => {});   // 절대 끝나지 않음 = 실내 GPS
    const p = withTimeout(never, 8000);
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(8000);
    await assertion;
  });

  it('isTimeout이 타임아웃과 다른 오류를 구분한다', async () => {
    // 안내 문구가 갈린다 — 타임아웃이면 "실내라면 창가에서", 아니면 일반 오류
    expect(isTimeout(new TimeoutError(100))).toBe(true);
    expect(isTimeout(new Error('그 밖의 오류'))).toBe(false);
    expect(isTimeout(undefined)).toBe(false);
  });

  it('성공해도 타이머를 정리한다 (누수 방지)', async () => {
    const spy = jest.spyOn(global, 'clearTimeout');
    await withTimeout(Promise.resolve(1), 1000);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
