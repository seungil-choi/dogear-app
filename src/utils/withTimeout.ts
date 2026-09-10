/**
 * 약속된 시간 안에 끝나지 않으면 포기한다.
 *
 * 왜 필요했나 (2026-09-10):
 *   탐색 지도의 「현위치」 버튼이 눌러도 아무 일이 없다는 신고가 있었다.
 *   `Location.getCurrentPositionAsync()`에 **타임아웃이 없어서** 실내처럼 GPS fix가
 *   안 잡히는 곳에서는 영영 돌아오지 않았다. 그동안 버튼은 `disabled`로 잠겨 있어
 *   사용자 눈에는 완전히 죽은 버튼이었다 — 오류도 안 뜨고 되돌아오지도 않았다.
 *
 *   expo-location에는 타임아웃 옵션이 없다. 부르는 쪽이 걸어야 한다.
 *
 * 주의: 원본 작업을 취소하지는 못한다(Promise는 취소 불가). 기다리기를 그만둘 뿐이다.
 *       나중에 원본이 끝나도 결과는 버려진다.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`${ms}ms 안에 끝나지 않았습니다`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export const isTimeout = (e: unknown): e is TimeoutError =>
  e instanceof TimeoutError || (e as { name?: string })?.name === 'TimeoutError';
