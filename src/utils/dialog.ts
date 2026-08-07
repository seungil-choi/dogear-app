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
import { create } from 'zustand';

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

/**
 * 액션 시트 상태 — ActionSheetHost(앱 루트에 1회 마운트)가 그린다.
 *
 * 왜 OS Alert을 안 쓰는가:
 *   **안드로이드 AlertDialog는 버튼을 3개(positive/negative/neutral)까지만 받는다.**
 *   장소 상세의 ⋯ 메뉴는 액션 3개 + 취소 = 4개라 초과분이 잘려나갔고,
 *   하필 잘린 게 '취소'라 한번 열면 닫을 수 없었다.
 *   항목 수 제약이 OS에 있어 wrapper로는 못 고친다 → 자체 레이어로 옮겼다.
 */
interface ActionSheetRequest {
  title: string;
  actions: ActionItem[];
  cancelText: string;
  resolve: (index: number) => void;
}

type ActionSheetState = {
  request: ActionSheetRequest | null;
  open: (req: ActionSheetRequest) => void;
  /**
   * 선택(index) 또는 취소(-1)로 요청을 마감한다.
   *
   * target을 함께 받는 이유: 시트는 닫힘 애니메이션이 끝난 뒤에 마감되는데,
   * 그 사이에 다른 시트가 열리면 이전 시트의 선택 결과가 **새 요청**에 꽂힌다.
   * 마감하려던 대상이 아직 현재 요청인지 확인하고, 아니면 무시한다.
   */
  resolve: (target: ActionSheetRequest, index: number) => void;
};

export const useActionSheetStore = create<ActionSheetState>((set, get) => ({
  request: null,
  open: request => {
    // 이미 열려 있으면 이전 요청을 취소로 마감한다 — 매달린 Promise를 남기지 않는다
    const prev = get().request;
    set({ request });
    if (prev) prev.resolve(-1);
  },
  resolve: (target, index) => {
    if (get().request !== target) return;   // 이미 다른 요청으로 교체됨 → 무시
    set({ request: null });
    target.resolve(index);
  },
}));

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
  return new Promise<number>(resolve => {
    useActionSheetStore.getState().open({ title, actions, cancelText, resolve });
  });
}
