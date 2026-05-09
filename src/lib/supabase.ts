import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SUPABASE_URL as ENV_SUPABASE_URL, SUPABASE_ANON_KEY as ENV_SUPABASE_ANON_KEY } from '../config/env';

const SUPABASE_URL     = ENV_SUPABASE_URL     || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = ENV_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// ─── SSR-safe 스토리지 어댑터 ─────────────────────────────────────────
// 웹 SSR(Node.js) 환경에서는 window/localStorage 접근 불가 → 인메모리 폴백
// 브라우저 런타임에서는 localStorage, 네이티브에서는 AsyncStorage 사용
function makeStorage() {
  // 네이티브 (iOS / Android)
  if (Platform.OS !== 'web') {
    // 동적 require로 네이티브 전용 패키지를 웹 번들에 포함하지 않음
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  }

  // 브라우저 web (typeof window 확인으로 SSR 분리)
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return {
      getItem:    (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem:    (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
      removeItem: (key: string) => { localStorage.removeItem(key); return Promise.resolve(); },
    };
  }

  // SSR 폴백 — 세션을 저장하지 않음 (서버에서는 auth 불필요)
  const mem: Record<string, string> = {};
  return {
    getItem:    (key: string) => Promise.resolve(mem[key] ?? null),
    setItem:    (key: string, value: string) => { mem[key] = value; return Promise.resolve(); },
    removeItem: (key: string) => { delete mem[key]; return Promise.resolve(); },
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: makeStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
