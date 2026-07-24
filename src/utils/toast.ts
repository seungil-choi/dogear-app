/**
 * 경량 토스트
 *
 * notify()는 Alert이라 확인을 눌러야 사라진다 → 인사·안내처럼 흐름을 끊으면 안 되는
 * 메시지는 이 토스트를 쓴다. 화면 하단에 잠깐 떴다 자동으로 사라진다.
 *
 * 사용: toast('다시 오셨네요, 승일님')
 */
import { create } from 'zustand';

type ToastState = {
  message: string | null;
  show: (message: string) => void;
  hide: () => void;
};

export const useToastStore = create<ToastState>(set => ({
  message: null,
  show: message => set({ message }),
  hide: () => set({ message: null }),
}));

/** 어디서나 호출 가능 (컴포넌트 밖에서도) */
export const toast = (message: string) => useToastStore.getState().show(message);
