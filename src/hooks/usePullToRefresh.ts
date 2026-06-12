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
import { useState, useCallback } from 'react';
import { refreshAll } from '../utils/refreshBus';

/** 새로고침 스피너 최소 표시 시간 (ms) — 즉시 사라지는 어색함 방지 */
const MIN_SPINNER_MS = 500;

export function usePullToRefresh() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await refreshAll();
    } finally {
      const elapsed = Date.now() - started;
      const remain = Math.max(0, MIN_SPINNER_MS - elapsed);
      setTimeout(() => setRefreshing(false), remain);
    }
  }, []);

  return { refreshing, onRefresh };
}
