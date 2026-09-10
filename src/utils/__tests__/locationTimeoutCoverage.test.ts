/**
 * `getCurrentPositionAsync`는 **반드시** 타임아웃과 함께 불러야 한다.
 *
 * 무슨 일이 있었나 (2026-09-10):
 *   탐색 지도의 「현위치」 버튼이 눌러도 아무 반응이 없다는 신고.
 *   원인은 `expo-location`에 **타임아웃 옵션이 없다는 것**이었다. 부르는 쪽이 걸지 않으면
 *   GPS fix가 안 잡히는 곳에서 영영 돌아오지 않고, 그동안 버튼은 disabled로 잠긴다.
 *   오류도 안 뜨고 되돌아오지도 않는 죽은 버튼이 된다.
 *
 *   그리고 앱 전체 **5곳 모두** 타임아웃이 없었다. 한 곳만 고치면 나머지 넷이 남는다.
 *
 * 규칙:
 *   `Location.getCurrentPositionAsync(` 호출은 `withTimeout(...)`으로 감싼다.
 *   대기 한계값은 `src/config/locationTimeout.ts` 한 곳에서 가져온다(자리마다 숫자를 흩뿌리지 않는다).
 *
 * 새 호출부가 생기면 이 테스트가 먼저 깨진다.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SEARCH_DIRS = ['app', 'src'];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        walk(full);
      } else if (/\.tsx?$/.test(e.name)) {
        out.push(full);
      }
    }
  };
  for (const d of SEARCH_DIRS) walk(path.join(ROOT, d));
  return out;
}

/** 문서·주석이 아니라 실제 호출만 센다 */
const CALL = /Location\.getCurrentPositionAsync\s*\(/g;

/**
 * 주석을 지운다 — 길이를 유지해 줄 번호가 어긋나지 않게 공백으로 바꾼다.
 * (이 규칙을 설명하는 주석 자체가 호출로 잡히는 일이 실제로 있었다)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

describe('위치 취득 타임아웃 적용', () => {
  const files = sourceFiles();

  it('소스 파일을 찾는다', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('getCurrentPositionAsync를 부르는 모든 곳이 withTimeout으로 감싸져 있다', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      const calls = [...src.matchAll(CALL)];
      if (calls.length === 0) continue;

      const rel = path.relative(ROOT, file);
      for (const m of calls) {
        // 호출 지점 앞 200자 안에 withTimeout(이 있어야 감싼 것으로 본다
        const before = src.slice(Math.max(0, m.index! - 200), m.index!);
        if (!/withTimeout\s*\(/.test(before)) {
          const line = src.slice(0, m.index!).split('\n').length;
          offenders.push(`${rel}:${line}`);
        }
      }
      // 감쌌다면 한계값도 공용 설정에서 가져와야 한다
      if (!/LOCATION_TIMEOUT_MS/.test(src)) {
        offenders.push(`${rel} — LOCATION_TIMEOUT_MS를 쓰지 않음(숫자 직접 기입 금지)`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('알려진 호출부 개수가 유지된다 (새 호출부가 생기면 위 규칙을 확인할 것)', () => {
    const total = files.reduce(
      (n, f) => n + [...stripComments(fs.readFileSync(f, 'utf8')).matchAll(CALL)].length,
      0,
    );
    expect(total).toBe(5);
  });
});
