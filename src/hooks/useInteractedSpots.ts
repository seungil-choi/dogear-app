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
 *   - 반환: { spots: spot_id → Spot Map, pending: 아직 조회가 안 끝났는지 }
 *
 * ⚠️ pending이 왜 필요한가:
 *   spots RLS는 status='active'만 읽게 한다(spots_read_authenticated). 어드민이
 *   장소를 숨기거나 차단하면 그 장소는 **영원히 조회되지 않는다.**
 *   호출부가 "아직 못 받았다"와 "받을 수 없다"를 구분하지 못하면 로딩이 끝나지
 *   않는다. 조회를 시도했고 끝났다는 사실을 알려준다.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { IS_DEV_SEED } from '@/config/env';
import type { Spot } from '@/types';
import { authoredDescription } from '@/utils/spotDescription';

export interface InteractedSpots {
  spots: Record<string, Spot>;
  /** 보충 조회가 아직 진행 중. false면 더 기다려도 늘지 않는다. */
  pending: boolean;
}

export function useInteractedSpots(spotIds: string[]): InteractedSpots {
  const storeSpots = useAppStore(s => s.spots);
  const [fetched, setFetched] = useState<Record<string, Spot>>({});
  // 조회를 끝낸 id들. 결과가 비어도(숨긴 장소) 여기 들어간다 — 그래야 무한 로딩이 안 된다.
  const [settled, setSettled] = useState<Set<string>>(() => new Set());

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
    const attempted = missingIds;

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
          // 빠뜨리면 카드가 기본 공원 일러스트로 떨어져 상세 화면과 썸네일이 어긋난다
          subcategory: s.subcategory ?? undefined,
          latitude: s.latitude,
          longitude: s.longitude,
          address_text: s.address_text ?? undefined,
          neighborhood: s.neighborhood ?? undefined,
          cover_image_url: s.cover_image_url ?? undefined,
          opening_hours: s.opening_hours ?? undefined,
          features: s.features ?? undefined,
          // spots를 직접 읽는 경로라 원본 설명이 그대로 온다 — 여기서도 같은 규칙으로 거른다
          description: authoredDescription(s.description, s.subcategory),
          caution: s.caution ?? undefined,
          status: (s.status ?? 'active') as Spot['status'],
          created_source: (s.created_source ?? 'seed') as Spot['created_source'],
          created_at: s.created_at ?? new Date().toISOString(),
        };
      }
      setFetched(prev => ({ ...prev, ...add }));
      // 조회한 id는 결과 유무와 무관하게 '끝난 것'으로 표시한다.
      // 숨겨진 장소는 아무리 다시 물어도 오지 않는다.
      setSettled(prev => {
        const next = new Set(prev);
        for (const id of attempted) next.add(id);
        return next;
      });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  return useMemo(() => ({
    spots: { ...fetched, ...storeMap },
    // 아직 물어보지도 않은 id가 남아 있을 때만 '대기 중'이다.
    pending: !IS_DEV_SEED && missingIds.some(id => !settled.has(id)),
  }), [fetched, storeMap, missingIds, settled]);
}
