/**
 * Icon이 lucide 개별 모듈을 deep import한 뒤에도 실제로 렌더되는지 잠근다.
 *
 * 왜 필요한가:
 *   배럴 import는 Metro가 트리셰이킹을 못 해 아이콘 약 1,500개를 통째로 싣는다
 *   (실측 1.79MB). 그래서 'lucide-react-native/dist/esm/icons/<name>.mjs'를
 *   직접 가리키는데, 이건 패키지의 내부 경로이고 default export 인터롭에 기댄다.
 *   경로가 바뀌면 빌드가 실패해 바로 드러나지만, default 바인딩이 undefined로
 *   풀리는 경우는 "아이콘이 안 보인다"로만 나타나 조용히 지나갈 수 있다.
 *   그 경우를 여기서 잡는다.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Icon } from '../Icon';

describe('Icon', () => {
  it('시맨틱 이름으로 실제 컴포넌트를 렌더한다', () => {
    let r: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<Icon name="paw" size={24} color="#FF7A30" />); });
    expect(r!.toJSON()).not.toBeNull();
  });

  it('deep import한 아이콘이 undefined로 풀리지 않는다', () => {
    // 카테고리별로 하나씩 — import 블록이 통째로 깨지면 여기서 걸린다
    const names = ['home', 'map', 'paw', 'bookmark', 'user', 'close', 'check', 'bell'] as const;
    for (const name of names) {
      let r: renderer.ReactTestRenderer;
      act(() => { r = renderer.create(<Icon name={name} size={20} color="#000" />); });
      expect(r!.toJSON()).not.toBeNull();
    }
  });
});
