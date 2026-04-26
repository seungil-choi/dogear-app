/**
 * useMySpots — 내 스팟 탭 데이터 훅
 *
 * 단골 스팟, 저장 스팟, 방문 기록을 각각 조회한다.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

export interface RegularSpotItem {
  spotId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
  visitCount: number;
  lastVisitAt: string;
  regularStatus: 'none' | 'candidate' | 'regular';
}

export interface SavedSpotItem {
  spotId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
  savedType: 'want_to_go' | 'go_again';
  savedAt: string;
}

export interface VisitHistoryItem {
  checkinId: string;
  spotId: string;
  spotName: string;
  category: string;
  neighborhood: string | null;
  checkedInAt: string;
  feelingTags: string[];
  note: string | null;
}

interface UseMySpots {
  regularSpots: RegularSpotItem[];
  savedSpots: SavedSpotItem[];
  visitHistory: VisitHistoryItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useMySpots(): UseMySpots {
  const [regularSpots, setRegularSpots] = useState<RegularSpotItem[]>([]);
  const [savedSpots, setSavedSpots] = useState<SavedSpotItem[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const activeDog = useAppStore(s => s.activeDog);

  const refresh = useCallback(async () => {
    if (!activeDog?.dog_id) return;

    setIsLoading(true);

    try {
      const [regularResult, savedResult, historyResult] = await Promise.all([
        // 단골 스팟
        supabase.rpc('get_regular_spots', { p_dog_id: activeDog.dog_id }),

        // 저장 스팟
        supabase
          .from('saved_spots')
          .select(`
            spot_id,
            saved_type,
            saved_at,
            spots!inner (
              name,
              category,
              latitude,
              longitude,
              neighborhood
            )
          `)
          .eq('dog_id', activeDog.dog_id)
          .order('saved_at', { ascending: false }),

        // 방문 기록 (최근 50개)
        supabase
          .from('paw_checkins')
          .select(`
            checkin_id,
            spot_id,
            checked_in_at,
            feeling_tags,
            note,
            spots!inner (
              name,
              category,
              neighborhood
            )
          `)
          .eq('dog_id', activeDog.dog_id)
          .order('checked_in_at', { ascending: false })
          .limit(50),
      ]);

      if (regularResult.data) {
        setRegularSpots(
          regularResult.data.map((r: any) => ({
            spotId: r.spot_id,
            name: r.name,
            category: r.category,
            latitude: r.latitude,
            longitude: r.longitude,
            neighborhood: r.neighborhood,
            visitCount: r.visit_count,
            lastVisitAt: r.last_visit_at,
            regularStatus: r.regular_status,
          }))
        );
      }

      if (savedResult.data) {
        setSavedSpots(
          savedResult.data.map((s: any) => ({
            spotId: s.spot_id,
            name: s.spots.name,
            category: s.spots.category,
            latitude: s.spots.latitude,
            longitude: s.spots.longitude,
            neighborhood: s.spots.neighborhood,
            savedType: s.saved_type,
            savedAt: s.saved_at,
          }))
        );
      }

      if (historyResult.data) {
        setVisitHistory(
          historyResult.data.map((c: any) => ({
            checkinId: c.checkin_id,
            spotId: c.spot_id,
            spotName: c.spots.name,
            category: c.spots.category,
            neighborhood: c.spots.neighborhood,
            checkedInAt: c.checked_in_at,
            feelingTags: c.feeling_tags ?? [],
            note: c.note,
          }))
        );
      }
    } catch (err) {
      console.error('useMySpots error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeDog?.dog_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { regularSpots, savedSpots, visitHistory, isLoading, refresh };
}
