/**
 * useInteractedSpots — 내가 상호작용한 장소(발도장/저장/방문)의 Spot 정보 조회 훅
 *
 * 배경:
 *   store.spots 는 useNearbySpots 가 채우는 "현재 위치 주변" 장소만 담는다.
 *   강아지 상세(발도장/저장/방문 곳)는 과거에 멀리서 기록한 장소도 보여줘야 하는데,
 *   그 장소가 지금 주변이 아니면 store.spots 에 없어 카드가 사라지는 버그가 있었다.
 *   → 여기서 상호작용한 spot_id 합집합을 spots 테이블에서 직접 조회해 채운다.
 *
 * 동작:
 *   - DEV_SEED: store.spots(mockSpots)로 충분 → 추가 조회 없음
 *   - 실모드: store.spots 에 없는 id만 supabase 에서 보충 fetch
 *   - 반환: spot_id → Spot 조회용 Map (store.spots + 보충분 병합)
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { IS_DEV_SEED } from '@/config/env';
import type { Spot } from '@/types';

export function useInteractedSpots(spotIds: string[]): Record<string, Spot> {
  const storeSpots = useAppStore(s => s.spots);
  const [fetched, setFetched] = useState<Record<string, Spot>>({});

  // store.spots 를 우선 조회용 맵으로
  const storeMap = useMemo(() => {
    const m: Record<string, Spot> = {};
    for (const sp of storeSpots) m[sp.spot_id] = sp;
    return m;
  }, [storeSpots]);

  // store.spots 에도, 이미 보충분에도 없는 id만 추려서 조회
  const missingIds = useMemo(() => {
    const uniq = Array.from(new Set(spotIds));
    return uniq.filter(id => !storeMap[id] && !fetched[id]);
  }, [spotIds, storeMap, fetched]);

  const missingKey = missingIds.join(',');

  useEffect(() => {
    if (IS_DEV_SEED) return;        // 데모는 mockSpots로 충분
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .in('spot_id', missingIds);
      if (cancelled || error || !data) return;

      const add: Record<string, Spot> = {};
      for (const s of data as any[]) {
        add[s.spot_id] = {
          spot_id: s.spot_id,
          name: s.name,
          category: s.category,
          latitude: s.latitude,
          longitude: s.longitude,
          address_text: s.address_text ?? undefined,
          neighborhood: s.neighborhood ?? undefined,
          cover_image_url: s.cover_image_url ?? undefined,
          opening_hours: s.opening_hours ?? undefined,
          features: s.features ?? undefined,
          description: s.description ?? undefined,
          caution: s.caution ?? undefined,
          status: (s.status ?? 'active') as Spot['status'],
          created_source: (s.created_source ?? 'seed') as Spot['created_source'],
          created_at: s.created_at ?? new Date().toISOString(),
        };
      }
      setFetched(prev => ({ ...prev, ...add }));
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  return useMemo(() => ({ ...fetched, ...storeMap }), [fetched, storeMap]);
}
