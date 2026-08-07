/**
 * usePullToRefresh — RefreshControl 연결 헬퍼
 *
 * 사용:
 *   const { refreshing, onRefresh } = usePullToRefresh();
 *   <ScrollView refreshControl={
 *     <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
 *       tintColor={Colors.brand.primary} colors={[Colors.brand.primary]} />
 *   }>
 *
 * refreshAll()로 refreshBus에 등록된 모든 데이터 페치를 트리거.
 * DEV_SEED 모드에선 핸들러가 없어 짧은 시각 효과만 발생 (최소 표시 시간 보장).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { refreshAll } from '../utils/refreshBus';

/** 새로고침 스피너 최소 표시 시간 (ms) — 즉시 사라지는 어색함 방지 */
const MIN_SPINNER_MS = 500;

export function usePullToRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  // 최소 표시 시간 타이머 — 새로고침 도중 화면을 떠나면 언마운트된 컴포넌트에
  // setState가 걸리므로 반드시 정리한다.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await refreshAll();
    } finally {
      const elapsed = Date.now() - started;
      const remain = Math.max(0, MIN_SPINNER_MS - elapsed);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setRefreshing(false), remain);
    }
  }, []);

  return { refreshing, onRefresh };
}
