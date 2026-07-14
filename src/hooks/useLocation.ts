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
