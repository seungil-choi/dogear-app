/**
 * useAppEntryPermissions — 앱 첫 진입(탭 진입) 시 OS 권한 자동 요청
 *
 * 별도 안내 화면 없이 홈에 들어오는 순간 OS 다이얼로그를 띄운다.
 *  - 위치: '미결정'일 때만 요청(=최초 1회). 허용 상태면 위치를 갱신해 주변 스팟 로드에 사용.
 *  - 알림: '미결정'일 때만 요청.
 *  - OS가 결정을 기억하므로 별도 플래그 없이 재프롬프트가 발생하지 않는다.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '@/store/useAppStore';

export function useAppEntryPermissions() {
  const setCurrentLocation = useAppStore(s => s.setCurrentLocation);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (Platform.OS === 'web') return;

    (async () => {
      // ── 위치 ──
      try {
        let status = (await Location.getForegroundPermissionsAsync()).status;
        if (status === 'undetermined') {
          status = (await Location.requestForegroundPermissionsAsync()).status;
        }
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setCurrentLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
          });
        }
      } catch {
        // 위치 실패는 무시 — 홈은 추천 폴백으로 채워짐
      }

      // ── 알림 ──
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'undetermined') {
          await Notifications.requestPermissionsAsync();
        }
      } catch {
        // 알림 실패 무시
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
