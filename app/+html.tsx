/**
 * Expo Router 웹 빌드용 커스텀 HTML 템플릿
 *
 * 목적:
 *   1. iOS Safari PWA 메타 태그 (apple-mobile-web-app-*)
 *   2. viewport-fit=cover (노치/Dynamic Island 영역까지 콘텐츠)
 *   3. iOS Safari input 자동 줌 방지 (font-size 16px 강제)
 *   4. Theme color (브라우저 UI 색)
 *   5. 노 줌 / 핀치 줌 차단 (PWA 일관성)
 *
 * 주의: dev 모드에선 무시되고 production web build에서만 적용.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
         * iOS PWA 핵심 메타
         *  - viewport-fit=cover: 노치/홈인디케이터 영역까지 그림
         *  - user-scalable=no: 핀치 줌 차단 (앱 일관성)
         *  - maximum-scale=1: 입력 포커스 시 줌 방지 보강
         */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        {/* iOS PWA — 홈 화면 추가 시 fullscreen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DogEar" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* 브라우저 UI 색 (Android Chrome 주소창, iOS Safari 상단바) */}
        <meta name="theme-color" content="#FF7A30" />

        {/*
         * PWA 매니페스트 (Android Chrome + 데스크톱 PWA)
         *   - public/manifest.json 정적 호스팅
         *   - 아이콘 실파일은 public/icons/ 에 배치 (README 참고)
         */}
        <link rel="manifest" href="/manifest.json" />

        {/*
         * iOS Safari — manifest를 읽지 않으므로 apple-touch-icon으로 별도 처리
         *   - 180x180 단일 파일이면 충분 (iOS가 자동 리사이즈)
         */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />

        {/* 브라우저 탭 favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />

        {/* SEO / 공유 */}
        <meta name="description" content="우리 강아지와 가본 곳, 갈 곳을 발도장으로 기록해요." />
        <meta name="format-detection" content="telephone=no" />

        {/* Open Graph */}
        <meta property="og:title" content="DogEar — 발도장 산책 기록" />
        <meta property="og:description" content="우리 강아지와 가본 곳, 갈 곳을 발도장으로 기록해요." />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ko_KR" />

        {/* Expo Router default scroll reset */}
        <ScrollViewStyleReset />

        {/*
         * iOS Safari 자동 줌 방지:
         *   - input/textarea/select font-size를 16px 이상으로 강제
         *   - iOS는 16px 미만 input focus 시 자동 확대됨
         */}
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalCss = `
/* iOS Safari 자동 줌 방지 */
input, textarea, select, button {
  font-size: 16px;
}

/* CJK 텍스트 줄바꿈 자연스럽게 */
* {
  word-break: keep-all;
}

/* 시스템 폰트로 한글 가독성 향상 */
html, body {
  font-family:
    -apple-system, BlinkMacSystemFont,
    'Apple SD Gothic Neo', 'Pretendard',
    'Noto Sans KR', 'Malgun Gothic',
    'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 핀치/더블탭 줌 차단 */
html, body {
  touch-action: manipulation;
  overscroll-behavior-y: none;
}

/* iOS PWA safe-area 환경 변수 활용 */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
`;
