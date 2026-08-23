/**
 * usePawCheckin — 발도장 저장 훅
 *
 * paw-checkin Edge Function을 호출한다.
 * PawFlowStore의 상태를 읽어 요청을 구성한다.
 */

import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
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
  /** @param photoUrls 업로드 완료된 사진 public URL 목록 (최대 3장).
   *  스토어 pawFlow.photoUris는 로컬 URI일 수 있어 업로드 결과를 명시 전달한다. */
  submit: (photoUrls?: string[]) => Promise<PawCheckinResult>;
  isSubmitting: boolean;
  error: string | null;
}

export function usePawCheckin(): UsePawCheckinReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeDog = useAppStore(s => s.activeDog);
  const pawFlow = useAppStore(s => s.pawFlow);
  const currentLocation = useAppStore(s => s.currentLocation);
  const setCurrentLocation = useAppStore(s => s.setCurrentLocation);
  const selectedSpotId = pawFlow.selectedSpot?.spot_id;
  const selectedFeelingTags = pawFlow.selectedTags;
  const note = pawFlow.note;
  const visibilityLevel = pawFlow.visibility;

  const submit = useCallback(async (photoUrls?: string[]): Promise<PawCheckinResult> => {
    if (!activeDog?.dog_id) {
      throw new Error('강아지 정보가 없어요');
    }
    if (!selectedSpotId) {
      throw new Error('스팟을 선택해 주세요');
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // ⚠️ 스토어의 currentLocation을 그대로 보내지 않는다.
      //    그 값은 지도·앱 진입 때 잡힌 것이라 **몇 시간 전 좌표일 수 있고**,
      //    실제로 공원에서 잡힌 좌표가 남아 집에서도 발도장이 찍혔다(거리 0m).
      //    제출 시점에 새로 읽고, 실패하면 스토어 값으로 폴백하되 나이를 함께 보낸다.
      let fix: { latitude: number; longitude: number; accuracy?: number; capturedAt: number } | null = null;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        fix = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
          capturedAt: loc.timestamp ?? Date.now(),
        };
        setCurrentLocation(fix);
      } catch {
        // GPS를 못 읽었다 — 스토어 값으로 진행하되 서버가 나이를 보고 판단한다
        if (currentLocation) {
          fix = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            capturedAt: currentLocation.capturedAt ?? 0,
          };
        }
      }

      const { data, error: fnError } = await supabase.functions.invoke('paw-checkin', {
        body: {
          dogId: activeDog.dog_id,
          spotId: selectedSpotId,
          feelingTags: selectedFeelingTags,
          note: note || undefined,
          photoUrls: photoUrls?.length ? photoUrls : undefined,
          visibilityLevel: visibilityLevel as VisibilityLevel,
          sourceType: 'global_cta',
          // 서버 측 근접성 재검증을 위한 좌표/정확도/측정시각
          userLat: fix?.latitude,
          userLng: fix?.longitude,
          accuracy: fix?.accuracy,
          locationCapturedAt: fix?.capturedAt,
        },
      });

      if (fnError) {
        // supabase-js는 non-2xx를 전부 "Edge Function returned a non-2xx status code"라는
        // 한 문장으로 뭉갠다. 그대로 띄우면 사용자도 우리도 원인을 알 수 없으므로
        // 상태 코드별로 실제 사유를 풀어준다.
        const status = fnError.context?.status;
        const serverMsg: string | undefined =
          fnError.context?.body?.message ?? fnError.context?.body?.error;

        // 중복 체크인
        if (status === 409 || fnError.message?.includes('409')) {
          throw new Error('최근 1시간 내에 이미 발도장을 남겼어요');
        }
        // 위치 가드 — 서버가 보낸 거리 안내를 그대로 노출
        if (status === 403) {
          throw new Error(serverMsg ?? '장소 근처에서만 발도장을 남길 수 있어요');
        }
        // 대상이 서버에 없음 — 아직 승인되지 않은 제안 장소가 대표적이다
        if (status === 404) {
          throw new Error(
            serverMsg === 'Dog not found'
              ? '강아지 정보를 찾을 수 없어요. 앱을 다시 시작해주세요.'
              : '아직 등록 검토가 끝나지 않은 장소예요. 승인되면 발도장을 남길 수 있어요.',
          );
        }
        // 좌표 이상 등 서버가 사유를 명시한 경우
        if (status === 422 || status === 400) {
          throw new Error(serverMsg ?? '입력값을 확인해주세요.');
        }
        if (status === 401) {
          throw new Error('로그인이 만료됐어요. 다시 로그인해주세요.');
        }
        throw new Error(
          serverMsg ?? `발도장을 저장하지 못했어요${status ? ` (오류 ${status})` : ''}. 잠시 후 다시 시도해주세요.`,
        );
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
  }, [activeDog, selectedSpotId, selectedFeelingTags, note, visibilityLevel, currentLocation, setCurrentLocation]);

  return { submit, isSubmitting, error };
}
