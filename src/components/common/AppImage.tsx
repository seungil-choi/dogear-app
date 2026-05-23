/**
 * AppImage — 크로스플랫폼 이미지 컴포넌트
 *
 * - 웹: HTML <img> 직접 사용 (RNW Image / expo-image 둘 다 웹에서 렌더링 실패)
 * - 네이티브: react-native Image
 */
import React from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import type { StyleProp, ImageStyle } from 'react-native';

interface AppImageProps {
  source: { uri?: string } | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  /** 스크린리더 라벨. 정보형 이미지면 반드시 지정. 장식용이면 accessibilityIgnoresInvertColors와 함께 빈 문자열. */
  accessibilityLabel?: string;
  /** 정보 전달 없는 장식용 이미지 (스크린리더에서 건너뛰기) */
  decorative?: boolean;
}

export function AppImage({
  source,
  style,
  resizeMode = 'cover',
  accessibilityLabel,
  decorative,
}: AppImageProps) {
  if (!source?.uri) return null;

  if (Platform.OS === 'web') {
    const flat = StyleSheet.flatten(style) as React.CSSProperties | undefined;
    const objectFit: React.CSSProperties['objectFit'] =
      resizeMode === 'stretch' ? 'fill' :
      resizeMode === 'center' ? 'none' : resizeMode as any;
    return (
      // @ts-ignore — web only
      <img
        src={source.uri}
        style={{
          display: 'block',
          objectFit,
          ...(flat as any),
        }}
        // 웹은 alt 속성으로 a11y 처리. 장식용이면 빈 문자열(스크린리더 skip)
        alt={decorative ? '' : (accessibilityLabel ?? '')}
        role={decorative ? 'presentation' : undefined}
        loading="lazy"
      />
    );
  }

  return (
    <Image
      source={{ uri: source.uri }}
      style={style}
      resizeMode={resizeMode}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? 'none' : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no' : 'auto'}
    />
  );
}
