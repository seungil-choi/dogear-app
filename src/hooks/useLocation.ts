/**
 * useLocation — 위치 권한 및 현재 위치 훅
 *
 * 앱 시작 시 위치 권한 요청 + 현재 위치 조회 → AppStore에 반영
 */

import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '@/store/useAppStore';

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface UseLocationReturn {
  permissionStatus: PermissionStatus;
  isLocating: boolean;
  requestPermission: () => Promise<void>;
}

export function useLocation(): UseLocationReturn {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isLocating, setIsLocating] = useState(false);
  const setCurrentLocation = useAppStore(s => s.setCurrentLocation);

  useEffect(() => {
    checkAndRequestPermission();
  }, []);

  async function checkAndRequestPermission() {
    const { status: existing } = await Location.getForegroundPermissionsAsync();

    if (existing === 'granted') {
      setPermissionStatus('granted');
      await fetchLocation();
    } else {
      setPermissionStatus(existing as PermissionStatus);
    }
  }

  async function requestPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status as PermissionStatus);

    if (status === 'granted') {
      await fetchLocation();
    }
  }

  async function fetchLocation() {
    setIsLocating(true);
    try {
      // 1) 마지막으로 알려진 위치를 먼저 즉시 반영한다(캐시라 즉답).
      //    이게 없으면: currentLocation이 null인 채로 첫 페치가 나가 서버가 서울 폴백을
      //    돌려주고(콜드 2~3s), GPS가 잡히면 실제 위치로 두 번째 페치가 또 나갔다.
      //    (콜드 호출 2회 + 서울이 잠깐 떴다 바뀜) 마지막 위치를 시드하면 첫 페치부터
      //    내 주변이라 호출이 한 번으로 준다. 지도 탭 현위치 버튼과 같은 전략.
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setCurrentLocation({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            accuracy: last.coords.accuracy ?? undefined,
          });
        }
      } catch { /* 마지막 위치 없음 — 아래 정밀 조회로 진행 */ }

      // 2) 정밀 위치로 갱신. 50m 미만 이동이면 useNearbySpots가 재페치를 생략한다.
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      });
    } catch (err) {
      console.warn('위치 조회 실패:', err);
      // 실패 시 가짜 좌표(서울)를 넣지 않는다 — 거리 왜곡·발도장 근접 가드 우회 방지.
      // 홈 추천은 서버 폴백(서울 스팟)으로 채워지므로 위치는 비워둔 채로 둔다.
    } finally {
      setIsLocating(false);
    }
  }

  return { permissionStatus, isLocating, requestPermission };
}
