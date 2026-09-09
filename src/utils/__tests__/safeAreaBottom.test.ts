/**
 * 하단 고정 버튼이 있는 화면은 safe-area의 'bottom'을 반드시 적용해야 한다.
 *
 * 왜 테스트로 못박나 (2026-09-09):
 *   `suggest-photo`(대표 사진 제안)가 `edges={['top']}`만 쓰고 있어서
 *   「사진 제안하기」 버튼이 기기 내비게이션 바에 깔렸다. 눌리지도 않았다.
 *   하단 고정 버튼을 가진 화면 12개 중 유일한 누락이었고, 문법·타입·기존 테스트가
 *   전부 통과하는 상태였다 — 레이아웃 계산 결과만 틀렸다.
 *
 *   회고 §5.3의 그 사고와 같은 종류다. "한 번 띄우면 즉시 보이지만
 *   정적 점검으로는 안 잡히는" 자리는 규칙을 기계가 지키게 한다.
 *
 * 규칙:
 *   하단 고정 요소(footer/bottomBar/ctaBar/submitBar)를 가진 화면이
 *   SafeAreaView에 edges를 **명시**했다면 그 안에 'bottom'이 있어야 한다.
 *
 * 예외:
 *   - `app/(tabs)/*` — 하단 탭바가 인셋을 처리한다. 여기에 'bottom'을 주면 여백이 두 번 들어간다.
 *   - edges 미지정 — react-native-safe-area-context의 기본값이 4면 전체라 안전하다.
 */

import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '../../../app');

/** 하단에 고정 배치되는 요소를 가진 화면인지 */
const HAS_BOTTOM_BAR = /\b(footer|bottomBar|ctaBar|submitBar)\b/;

function collectScreens(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectScreens(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('safe-area 하단 인셋', () => {
  const screens = collectScreens(APP_DIR);

  it('화면 파일을 찾는다 (경로가 바뀌면 이 테스트가 무의미해지므로 먼저 확인)', () => {
    expect(screens.length).toBeGreaterThan(20);
  });

  it('하단 고정 버튼이 있는 화면은 edges 명시 시 bottom을 포함한다', () => {
    const offenders: string[] = [];

    for (const file of screens) {
      const rel = path.relative(APP_DIR, file);
      if (rel.startsWith('(tabs)')) continue;   // 탭바가 인셋을 처리

      const src = fs.readFileSync(file, 'utf8');
      if (!HAS_BOTTOM_BAR.test(src)) continue;

      // edges를 명시한 SafeAreaView만 검사한다(미지정은 기본값이 4면이라 안전)
      for (const m of src.matchAll(/edges=\{\[([^\]]*)\]\}/g)) {
        if (!m[1].includes('bottom')) offenders.push(`${rel} → edges={[${m[1]}]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
