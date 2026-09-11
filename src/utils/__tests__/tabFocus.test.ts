/**
 * 탐색 탭 복귀 규칙 (2026-09-11 결정 — 「성격별로 나눔」)
 *   다른 탭으로 떠나면: 현위치 추적 · 선택한 장소 카드 · 클러스터 목록 · 하단 패널 높이 초기화
 *   유지:              지도 위치·배율 · 필터 · 검색어
 *
 * 핵심은 「다른 탭으로 떠남」과 「위에 화면이 쌓임」의 구분이다.
 * 뒤를 지우면 핀 → 상세 보기 → 뒤로에서 고른 카드가 사라지는 새 버그가 된다.
 */

import fs from 'fs';
import path from 'path';
import { isTabSwitchAway } from '../tabFocus';

const tabs = (active: string) => {
  const names = ['index', 'map', 'paw', 'my-spots', 'profile'];
  return { index: names.indexOf(active), routes: names.map(name => ({ name })) };
};

describe('isTabSwitchAway', () => {
  it('다른 탭으로 옮기면 true — 선택을 지운다', () => {
    expect(isTabSwitchAway(tabs('index'), 'map')).toBe(true);
    expect(isTabSwitchAway(tabs('my-spots'), 'map')).toBe(true);
    expect(isTabSwitchAway(tabs('profile'), 'map')).toBe(true);
  });

  it('활성 탭이 그대로면 false — 위에 장소 상세·발도장 모달이 쌓인 경우다', () => {
    expect(isTabSwitchAway(tabs('map'), 'map')).toBe(false);
  });

  it('state가 없거나 비정상이면 false — 모르면 지우지 않는다', () => {
    expect(isTabSwitchAway(undefined, 'map')).toBe(false);
    expect(isTabSwitchAway({ index: 0, routes: [] }, 'map')).toBe(false);
    expect(isTabSwitchAway({ index: 9, routes: [{ name: 'map' }] }, 'map')).toBe(false);
  });
});

describe('탐색 화면 연결', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../app/(tabs)/map.tsx'), 'utf8');

  it('blur 때 isTabSwitchAway로 판정한 뒤에만 초기화한다', () => {
    expect(src).toMatch(/addListener\(\s*'blur'/);
    expect(src).toMatch(/isTabSwitchAway\(\s*navigation\.getState\(\)\s*,\s*'map'\s*\)/);
  });

  it('초기화 대상은 진행 중이던 선택뿐이다 — 지도 위치·필터·검색어는 건드리지 않는다', () => {
    const body = src.match(/resetTransientRef\.current = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';
    expect(body).toMatch(/setIsTracking\(false\)/);
    expect(body).toMatch(/setSelectedId\(null\)/);
    expect(body).toMatch(/setClusterIds\(null\)/);
    expect(body).toMatch(/snapToHeight\('peek'\)/);
    expect(body).not.toMatch(/setMapCenter|setZoomLevel|setActiveFilter|setSearchQuery|setCenter/);
  });
});
