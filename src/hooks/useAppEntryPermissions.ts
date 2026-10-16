/**
 * useAppEntryPermissions — 홈 진입(로그인 완료) 시 OS 권한 자동 요청
 *
 * 별도 안내 화면 없이 홈에 들어오는 순간 OS 다이얼로그를 띄운다.
 *  - 위치: '미결정'일 때만 요청(=최초 1회). 허용 상태면 위치를 갱신해 주변 스팟 로드에 사용.
 *  - 알림: '미결정'일 때만 요청.
 *  - OS가 결정을 기억하므로 별도 플래그 없이 재프롬프트가 발생하지 않는다.
 *
 * 요청 시점은 **로그인이 끝나 앱 본체(탭)에 들어갈 수 있을 때**다. 예전엔 앱 실행 즉시
 * 요청해 로그인 화면 위로 위치·알림 팝업이 먼저 떴다 — 왜 필요한지 알 수 없는 시점이라
 * 거부율이 높고, 스토어 심사 기준(필요한 순간에 요청)에도 어긋난다.
 * 제재 계정은 앱 본체에 들어가지 못하므로 요청하지 않는다.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '@/store/useAppStore';
import { registerPushTokenNow } from './usePushToken';
import { withTimeout } from '../utils/withTimeout';
import { LOCATION_TIMEOUT_MS } from '../config/locationTimeout';

export function useAppEntryPermissions() {
  const setCurrentLocation = useAppStore(s => s.setCurrentLocation);
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const isAuthLoading = useAppStore(s => s.isAuthLoading);
  const userStatus = useAppStore(s => s.user?.status);
  const ran = useRef(false);

  // 세션 복원이 끝나고, 로그인돼 있고, 제재 계정이 아닐 때만 = 홈에 실제로 들어가는 시점
  const canEnterApp = isAuthenticated && !isAuthLoading && userStatus !== 'blocked';

  useEffect(() => {
    if (!canEnterApp) return;
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
          // 앱 진입 취득도 매달리면 안 된다 — 실패해도 홈은 서버 폴백으로 채워진다
          const pos = await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            LOCATION_TIMEOUT_MS.BACKGROUND,
          );
          setCurrentLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            capturedAt: pos.timestamp,
          });
        }
      } catch {
        // 위치 실패는 무시 — 홈은 추천 폴백으로 채워짐
      }

      // ── 알림 ──
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'undetermined') {
          const res = await Notifications.requestPermissionsAsync();
          // 허용 직후 바로 토큰을 등록한다. 예전엔 로그인 직후 한 번만 시도했는데 그때는 아직
          // 권한이 '미결정'이라 그냥 끝났고, 다음 콜드 스타트까지 토큰이 없었다(2026-10-16 감사).
          const uid = useAppStore.getState().user?.user_id;
          if (res.status === 'granted' && uid && useAppStore.getState().pushEnabled) {
            await registerPushTokenNow(uid);
          }
        }
      } catch {
        // 알림 실패 무시
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEnterApp]);
}
