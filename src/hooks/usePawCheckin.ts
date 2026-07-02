/**
 * usePawCheckin — 발도장 저장 훅
 *
 * paw-checkin Edge Function을 호출한다.
 * PawFlowStore의 상태를 읽어 요청을 구성한다.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { VisibilityLevel } from '@/types';

interface PawCheckinResult {
  checkinId: string;
  spotName: string;
  checkedInAt: string;
  visitSummary: {
    visitCount: number;
    lastVisitAt: string;
    regularStatus: string;
  } | null;
}

interface UsePawCheckinReturn {
  /** @param photoUrl 업로드 완료된 사진 public URL (스토어 pawFlow.photoUri는 로컬 URI일 수 있어 명시 전달) */
  submit: (photoUrl?: string) => Promise<PawCheckinResult>;
  isSubmitting: boolean;
  error: string | null;
}

export function usePawCheckin(): UsePawCheckinReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeDog = useAppStore(s => s.activeDog);
  const pawFlow = useAppStore(s => s.pawFlow);
  const currentLocation = useAppStore(s => s.currentLocation);
  const selectedSpotId = pawFlow.selectedSpot?.spot_id;
  const selectedFeelingTags = pawFlow.selectedTags;
  const note = pawFlow.note;
  const visibilityLevel = pawFlow.visibility;

  const submit = useCallback(async (photoUrl?: string): Promise<PawCheckinResult> => {
    if (!activeDog?.dog_id) {
      throw new Error('강아지 정보가 없어요');
    }
    if (!selectedSpotId) {
      throw new Error('스팟을 선택해 주세요');
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('paw-checkin', {
        body: {
          dogId: activeDog.dog_id,
          spotId: selectedSpotId,
          feelingTags: selectedFeelingTags,
          note: note || undefined,
          photoUrl: photoUrl || undefined,
          visibilityLevel: visibilityLevel as VisibilityLevel,
          sourceType: 'global_cta',
          // 서버 측 근접성 재검증을 위한 좌표/정확도
          userLat: currentLocation?.latitude,
          userLng: currentLocation?.longitude,
          accuracy: currentLocation?.accuracy,
        },
      });

      if (fnError) {
        // 중복 체크인
        if (fnError.message?.includes('409') || fnError.context?.status === 409) {
          throw new Error('최근 1시간 내에 이미 발도장을 남겼어요');
        }
        // 위치 가드 (403) — 서버가 보낸 메시지를 그대로 노출
        if (fnError.context?.status === 403) {
          const serverMsg = fnError.context?.body?.message
            ?? fnError.context?.body?.error
            ?? '장소 근처에서만 발도장을 남길 수 있어요';
          throw new Error(serverMsg);
        }
        throw fnError;
      }

      return {
        checkinId: data.checkin_id,
        spotName: data.spot_name,
        checkedInAt: data.checked_in_at,
        visitSummary: data.visit_summary ? {
          visitCount: data.visit_summary.visit_count,
          lastVisitAt: data.visit_summary.last_visit_at,
          regularStatus: data.visit_summary.regular_status,
        } : null,
      };
    } catch (err: any) {
      const message = err.message ?? '발도장 저장에 실패했어요';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeDog, selectedSpotId, selectedFeelingTags, note, visibilityLevel, currentLocation]);

  return { submit, isSubmitting, error };
}
