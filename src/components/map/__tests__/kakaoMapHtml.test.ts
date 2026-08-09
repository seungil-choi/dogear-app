/**
 * 지도 HTML 템플릿 회귀 테스트
 *
 * 이 파일의 지도 스크립트는 통째로 문자열이라 타입 검사도 린트도 닿지 않는다.
 * 실기기에서 흰 화면으로만 드러나는 구문 오류를 여기서 잡는다.
 */
import { buildKakaoMapHtml } from '../kakaoMapHtml';

const html = buildKakaoMapHtml({ appKey: 'TEST_KEY', initialLatitude: 37.5563, initialLongitude: 126.9237 });

/** WebView에서 실제로 실행되는 인라인 스크립트(카카오 SDK 로더 제외) */
function inlineScript(): string {
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m => m[1])
    .filter(src => src.trim().length > 0);
  expect(blocks).toHaveLength(1);   // SDK 로더는 src만 있고 본문이 비어 있다
  return blocks[0];
}

describe('buildKakaoMapHtml', () => {
  it('인라인 스크립트가 구문 오류 없이 파싱된다', () => {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(inlineScript())).not.toThrow();
  });

  it('appKey와 초기 좌표가 주입된다', () => {
    expect(html).toContain('appkey=TEST_KEY');
    expect(html).toContain('37.5563');
    expect(html).toContain('126.9237');
  });

  it('클러스터 격자 규칙(clusterGrid.ts)이 주입돼 있다', () => {
    const src = inlineScript();
    expect(src).toContain('function activeGridFor(');
    expect(src).toContain('function groupKeyOf(');
    // round를 쓰면 확대 시 없던 클러스터가 생긴다 — 되돌아가지 못하게 막는다
    expect(src).not.toMatch(/Math\.round\([^)]*\/\s*g\s*\)/);
  });

  it('클러스터를 탭으로 푸는 경로가 없다 (푸는 건 확대뿐)', () => {
    const src = inlineScript();
    expect(src).not.toContain('spiderKey');          // 방사형 펼치기 제거됨
    expect(src).toContain("type: 'clusterClick'");   // 대신 목록으로 넘긴다
    // 클러스터 탭 처리 안에서 지도 레벨을 바꾸지 않는다
    const clusterBranch = src.slice(src.indexOf('data-cluster-key'), src.indexOf("type: 'clusterClick'"));
    expect(clusterBranch).not.toContain('setLevel');
  });

  it('핀 라벨의 가로·세로가 둘 다 묶여 있다', () => {
    // 긴 상호("호펫 강아지 고양이 성신여대본점")가 화면 1/3을 먹어 지도를 덮었다.
    // 상한을 풀면 같은 일이 재발하므로 세 축을 함께 잠근다.
    const html = buildKakaoMapHtml({ appKey: 'k' });
    const label = html.slice(html.indexOf('.pin-label {'), html.indexOf('.cluster {'));

    const maxWidth = Number(label.match(/max-width:\s*(\d+)px/)?.[1]);
    expect(maxWidth).toBeLessThanOrEqual(100);       // 가로
    expect(label).toContain('-webkit-line-clamp: 2'); // 세로(줄 수)
    expect(label).toContain('overflow: hidden');      // 넘치면 말줄임
    // width:max-content가 있어야 짧은 이름이 상한까지 늘어나지 않는다
    expect(label).toContain('width: max-content');
  });
});
