/**
 * 크로스 플랫폼 다이얼로그 헬퍼
 *
 * React Native Web 환경에서 Alert.alert이 콘솔만 출력하고 실제 다이얼로그가
 * 안 뜨는 문제를 해결하기 위한 wrapper.
 *
 * 사용:
 *   import { notify, confirm, prompt } from '../utils/dialog';
 *   await confirm('정말 삭제할까요?', { destructive: true })
 */
import { Alert, Platform } from 'react-native';

type ConfirmOpts = {
  title?: string;
  cancelText?: string;
  confirmText?: string;
  destructive?: boolean;
};

/** 단순 알림 — 확인 1개 버튼만 */
export function notify(message: string, title?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(title ? `${title}\n\n${message}` : message);
    }
    return;
  }
  Alert.alert(title ?? '안내', message, [{ text: '확인' }]);
}

/** 확인 다이얼로그 — yes/no 선택 → Promise<boolean> */
export function confirm(message: string, opts: ConfirmOpts = {}): Promise<boolean> {
  const {
    title = '확인',
    cancelText = '취소',
    confirmText = '확인',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(title ? `${title}\n\n${message}` : message));
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** 액션 시트 — 여러 옵션 중 선택 → Promise<index | -1 (cancel)> */
export type ActionItem = { label: string; destructive?: boolean };
export function actionSheet(title: string, actions: ActionItem[], cancelText = '취소'): Promise<number> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return Promise.resolve(-1);
    // 웹: 간단히 prompt로 인덱스 받기 (1, 2, 3...)
    const list = actions.map((a, i) => `${i + 1}. ${a.label}`).join('\n');
    const ans = window.prompt(`${title}\n\n${list}\n\n번호 입력 (취소: 빈칸):`);
    if (!ans) return Promise.resolve(-1);
    const n = parseInt(ans, 10);
    if (Number.isNaN(n) || n < 1 || n > actions.length) return Promise.resolve(-1);
    return Promise.resolve(n - 1);
  }
  return new Promise(resolve => {
    Alert.alert(
      title,
      undefined,
      [
        ...actions.map((a, i) => ({
          text: a.label,
          style: a.destructive ? 'destructive' as const : 'default' as const,
          onPress: () => resolve(i),
        })),
        { text: cancelText, style: 'cancel' as const, onPress: () => resolve(-1) },
      ],
    );
  });
}
