/**
 * 클러스터 격자 회귀 테스트
 *
 * 지도 WebView에 주입되는 것과 **똑같은 코드 문자열**을 평가해 검증한다.
 * (kakaoMapHtml.ts는 CLUSTER_GRID_JS를 그대로 템플릿에 끼워 넣는다)
 *
 * 고정하려는 성질: "확대하면 묶음은 쪼개지기만 하고, 절대 새로 합쳐지지 않는다."
 * 이 성질이 깨졌을 때 실제로 나온 증상 —
 *   "줌인 했더니 없던 클러스터링이 생기는 게 말이 되냐,
 *    멀쩡하게 떨어져 있던 핀이 왜 합쳐지냐"
 */
import { CLUSTER_GRID_JS } from '../clusterGrid';

// 브라우저에서 실행되는 것과 동일한 소스를 평가해 함수를 꺼낸다.
// eslint-disable-next-line no-new-func
const grid = new Function(
  `${CLUSTER_GRID_JS}
   return { GRID_BASE: GRID_BASE, CLUSTER_MIN_LEVEL: CLUSTER_MIN_LEVEL,
            activeGridFor: activeGridFor, groupKeyOf: groupKeyOf };`,
)() as {
  GRID_BASE: number;
  CLUSTER_MIN_LEVEL: number;
  activeGridFor: (level: number) => number;
  groupKeyOf: (lat: number, lng: number, g: number) => string;
};

/** 재현 가능한 난수 — 동탄 일대 bbox(실제 스팟 밀집 구역) */
function samplePoints(n: number): Array<[number, number]> {
  let seed = 20260807;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: n }, () => [37.18 + rnd() * 0.1, 127.02 + rnd() * 0.12] as [number, number]);
}

const keyAt = (p: [number, number], level: number) =>
  grid.groupKeyOf(p[0], p[1], grid.activeGridFor(level));

describe('클러스터 격자', () => {
  it('확대해도 떨어져 있던 핀이 새로 합쳐지지 않는다 (레벨 14→1 전 구간)', () => {
    const pts = samplePoints(20000);
    const violations: string[] = [];

    for (let level = 14; level >= 2; level--) {
      // 확대한 상태(level-1)에서 같은 버킷인 점들을 모은다
      const fine = new Map<string, number[]>();
      pts.forEach((p, i) => {
        const k = keyAt(p, level - 1);
        const arr = fine.get(k);
        if (arr) arr.push(i); else fine.set(k, [i]);
      });

      // 그 점들은 축소 상태(level)에서도 반드시 같은 버킷이었어야 한다
      for (const idxs of fine.values()) {
        if (idxs.length < 2) continue;
        const coarse = keyAt(pts[idxs[0]], level);
        for (let j = 1; j < idxs.length; j++) {
          if (keyAt(pts[idxs[j]], level) !== coarse) {
            violations.push(
              `레벨 ${level}→${level - 1} 확대 시 합쳐짐: ` +
              `${pts[idxs[0]].map(v => v.toFixed(6))} / ${pts[idxs[j]].map(v => v.toFixed(6))}`,
            );
          }
        }
      }
    }

    expect(violations.slice(0, 3)).toEqual([]);
    expect(violations).toHaveLength(0);
  });

  it('격자는 확대할수록 좁아진다 (같거나 좁아짐, 절대 넓어지지 않음)', () => {
    for (let level = 14; level >= 2; level--) {
      expect(grid.activeGridFor(level - 1)).toBeLessThanOrEqual(grid.activeGridFor(level));
    }
  });

  it('모든 격자 폭이 GRID_BASE의 2의 거듭제곱 배다 (버킷 중첩의 전제)', () => {
    for (let level = 1; level <= 14; level++) {
      const ratio = grid.activeGridFor(level) / grid.GRID_BASE;
      expect(Math.log2(ratio) % 1).toBe(0);
    }
  });

  it('좌표가 완전히 같은 스팟은 어느 레벨에서도 같은 묶음이다 (지구 대표좌표 중복 대응)', () => {
    const p: [number, number] = [37.5563, 126.9237];
    for (let level = 1; level <= 14; level++) {
      expect(keyAt(p, level)).toBe(keyAt([...p] as [number, number], level));
    }
  });

  it('확대 구간(CLUSTER_MIN_LEVEL 미만)에서는 기준 격자만 쓴다', () => {
    for (let level = 1; level < grid.CLUSTER_MIN_LEVEL; level++) {
      expect(grid.activeGridFor(level)).toBe(grid.GRID_BASE);
    }
    expect(grid.activeGridFor(grid.CLUSTER_MIN_LEVEL)).toBeGreaterThan(grid.GRID_BASE);
  });
});
