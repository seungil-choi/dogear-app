/**
 * 경량 토스트 — 메시지 체계(V&N Spec) 의 **Notification** 채널.
 *
 * 규칙(§2.1): 입력 오류=인라인 / 결정 필요=Alert(confirm) / **그 외 결과 알림은 전부 토스트**.
 * notify()는 Alert이라 확인을 눌러야 사라진다 → 흐름을 끊어야 할 때만 쓴다.
 *
 * 사용:
 *   toast.success('발도장을 남겼어요')
 *   toast.error('사진 업로드에 실패했어요')
 *   toast('다시 오셨네요')            // = info
 *
 * 연달아 호출하면 마지막 것만 남기지 않고 **차례로 보여준다**(앞 메시지가 잘리지 않게).
 */
import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

type ToastState = {
  /** 현재 화면에 떠 있는 토스트 */
  current: ToastItem | null;
  /** 대기열 — 표시 중일 때 들어온 것들 */
  queue: ToastItem[];
  show: (message: string, variant?: ToastVariant) => void;
  /** 표시가 끝났을 때 호출 — 대기열에서 다음 것을 올린다 */
  next: () => void;
};

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  queue: [],
  show: (message, variant = 'info') => {
    const item: ToastItem = { id: ++seq, message, variant };
    if (get().current) set(s => ({ queue: [...s.queue, item] }));
    else set({ current: item });
  },
  next: () =>
    set(s => {
      const [head, ...rest] = s.queue;
      return { current: head ?? null, queue: rest };
    }),
}));

/** 어디서나 호출 가능 (컴포넌트 밖에서도). toast(msg) = info */
function base(message: string, variant: ToastVariant = 'info') {
  useToastStore.getState().show(message, variant);
}

export const toast = Object.assign(base, {
  success: (message: string) => base(message, 'success'),
  error: (message: string) => base(message, 'error'),
  info: (message: string) => base(message, 'info'),
});
