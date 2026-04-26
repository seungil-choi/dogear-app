import { View } from 'react-native';
import { Colors } from '../../src/constants/tokens';

// 발도장 탭 화면은 실제로 표시되지 않음
// 탭 버튼 자체가 /paw-checkin 모달을 열도록 _layout.tsx에서 처리
export default function PawPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: Colors.bg.primary }} />;
}
