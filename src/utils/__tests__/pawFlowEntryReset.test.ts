/**
 * 발도장 화면으로 들어가는 길은 두 종류다. 섞으면 버그가 난다.
 *
 * 무슨 일이 있었나 (2026-09-09):
 *   근접 실패(「장소에서 약 100m 떨어져 있어요」)로 중간 이탈한 뒤 발도장 탭을 다시 눌렀더니
 *   **이탈했던 화면이 그대로** 떴다 — 단계 2, 그때의 장소, 그때 고른 느낌 태그까지.
 *
 * 왜 그랬나:
 *   `pawFlow`는 persist 대상이 아니지만 **세션 메모리에는 남는다.**
 *   `resetPawFlow()`는 화면 안의 ✕/뒤로 버튼(`handleClose`)에서만 불렸다.
 *   기기 뒤로가기 제스처나 탭 전환으로 빠져나가면 아무도 지우지 않았고,
 *   재진입 시 `isPresetSpot = !!selectedSpot`가 true가 되어 곧장 단계 2로 갔다.
 *
 * ── 규칙 ────────────────────────────────────────────────
 *  ① 신규 진입 (FRESH)     — "처음부터"라는 뜻. push 전에 반드시 `resetPawFlow()`.
 *                            장소를 지정하는 경우 **reset 다음에** `setPawSpot()`
 *                            (순서가 뒤집히면 방금 고른 장소가 지워진다).
 *  ② 흐름 이어가기 (RESUME) — 발도장 흐름 **안에서** 갈라져 나갔다 돌아오는 길.
 *                            여기서 reset하면 진행 중이던 입력이 날아간다. 부르지 않는다.
 *
 * 새 경로가 생기면 아래 「등록되지 않은 경로」 테스트가 먼저 깨진다.
 * 그때 어느 종류인지 판단해서 목록에 넣을 것.
 */

import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '../../../app');

/** ① 신규 진입 — reset 필수 */
const FRESH_ENTRIES = [
  '(tabs)/_layout.tsx',    // 발도장 탭 버튼
  '(tabs)/map.tsx',        // 지도 히어로 카드 → 발도장 찍기
  '(tabs)/my-spots.tsx',   // 「아직 발도장이 없어요」 빈 상태 CTA
  'spot/[id].tsx',         // 장소 상세 → 발도장 남기기
];

/** ①-1 그중 장소를 지정하는 경로 — reset → setPawSpot 순서를 지켜야 한다 */
const FRESH_WITH_SPOT = ['(tabs)/map.tsx', 'spot/[id].tsx'];

/**
 * ② 흐름 이어가기 — reset 금지
 *   `suggest-spot`은 발도장 step 1에서 「찾는 곳이 없어요」로 갈라져 나온 화면이다.
 *   장소를 만들거나 고른 뒤 발도장으로 돌아오므로, 여기서 지우면 사용자가 방금 만든
 *   장소와 진행 상태가 함께 사라진다.
 */
const RESUME_PATHS = ['suggest-spot.tsx'];

const read = (rel: string) => fs.readFileSync(path.join(APP_DIR, rel), 'utf8');

function filesNavigatingToPawCheckin(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.tsx')) continue;
      const rel = path.relative(APP_DIR, full);
      if (rel === 'paw-checkin.tsx') continue;   // 화면 자신은 제외 (return이면 순회가 끊긴다)
      if (/router\.(push|replace)\(\s*['"]\/paw-checkin/.test(fs.readFileSync(full, 'utf8'))) {
        found.push(rel);
      }
    }
  };
  walk(APP_DIR);
  return found.sort();
}

describe('발도장 흐름 진입 시 초기화', () => {
  it('목록의 파일이 실제로 존재한다', () => {
    for (const rel of [...FRESH_ENTRIES, ...RESUME_PATHS]) {
      expect(fs.existsSync(path.join(APP_DIR, rel))).toBe(true);
    }
  });

  it('등록되지 않은 경로가 없다 (새 경로는 FRESH/RESUME 중 하나로 분류할 것)', () => {
    expect(filesNavigatingToPawCheckin())
      .toEqual([...FRESH_ENTRIES, ...RESUME_PATHS].sort());
  });

  it('신규 진입은 전부 resetPawFlow를 부른다', () => {
    const offenders = FRESH_ENTRIES.filter(rel => !/resetPawFlow\s*\(\s*\)/.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it('장소를 지정하는 신규 진입은 reset → setPawSpot 순서를 지킨다', () => {
    const offenders: string[] = [];
    for (const rel of FRESH_WITH_SPOT) {
      const src = read(rel);
      const reset = src.indexOf('resetPawFlow()');
      const setSpot = src.indexOf('setPawSpot(');
      if (reset === -1 || setSpot === -1 || reset > setSpot) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
