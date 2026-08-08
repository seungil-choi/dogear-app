/**
 * lucide-react-native 개별 아이콘 모듈의 타입 선언.
 *
 * 배럴(`from 'lucide-react-native'`)로 가져오면 Metro가 트리셰이킹을 하지 않아
 * 아이콘 약 1,500개가 통째로 번들에 실린다(실측 1.79MB). 그래서 개별 .mjs를 직접
 * 가리키는데, 패키지가 그 경로에는 .d.ts를 제공하지 않아 여기서 선언한다.
 */
declare module 'lucide-react-native/dist/esm/icons/*' {
  import type * as React from 'react';
  import type { SvgProps } from 'react-native-svg';

  export interface LucideIconProps extends SvgProps {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  const Icon: React.FC<LucideIconProps>;
  export default Icon;
}
