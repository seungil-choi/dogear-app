/**
 * 소셜 로그인 SDK 초기화 — 한 곳에서, 한 번만.
 *
 * 예전엔 로그인 화면 모듈이 import될 때만 초기화했다. 세션이 복원돼 탭으로 바로 들어온 사용자는
 * 로그인 화면을 거치지 않으므로, 로그아웃·탈퇴 때 카카오 logout/unlink가 '초기화 전 호출'로 실패하고
 * 그 예외가 삼켜졌다 — 탈퇴했는데 카카오 연결 끊기(정책 의무)가 안 되는 경로(2026-10-16 감사).
 * 로그인 화면과 세션 정리(socialSession) 양쪽이 이 함수를 먼저 부른다.
 */
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { IS_REAL_AUTH } from '../config/env';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let done = false;
export function ensureSocialSdks() {
  if (done || !IS_REAL_AUTH || Platform.OS === 'web') return;
  done = true;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
  // 카카오 네이티브 SDK 초기화 (New Architecture 정식 지원 라이브러리)
  initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '');
}
