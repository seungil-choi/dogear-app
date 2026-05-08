/**
 * SNS 간편가입 로고 컴포넌트
 *
 * 각 브랜드 가이드라인을 따른 정확한 로고를 SVG로 렌더.
 *  - Apple: 흰색 사과 (검은 배경 위)
 *  - Google: 컬러 G 로고 (Google Material colors)
 *  - Kakao: 검은 말풍선 (노란 배경 위)
 *  - Naver: 흰색 N (초록 배경 위)
 */

import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface LogoProps {
  size?: number;
}

// Apple — 흰색 사과 (단색)
export function AppleLogo({ size = 22 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08l.01.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

// Google — 4색 G 로고 (공식 Google Identity)
export function GoogleLogo({ size = 22 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

// Kakao — 검은 말풍선 (KakaoTalk 공식 심볼)
export function KakaoLogo({ size = 22 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3C6.477 3 2 6.582 2 11c0 2.812 1.797 5.281 4.5 6.703L5.227 21.5c-.082.273.227.508.469.32L10.234 18.953c.586.066 1.18.094 1.766.094 5.523 0 10-3.582 10-8s-4.477-8-10-8z"
        fill="#191919"
      />
    </Svg>
  );
}

// Naver — 흰색 N (Naver 공식 심볼)
export function NaverLogo({ size = 22 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.523 12.514L9.235 5h-4.96v14h5.202V11.486L14.765 19h4.96V5h-5.202v7.514z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

// 이메일 — 단색 라인 아이콘
export function EmailLogo({ size = 22, color = '#1A1612' }: LogoProps & { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 4v10h16V8l-8 5-8-5zm0-2l8 5 8-5H4z"
        fill={color}
      />
    </Svg>
  );
}
