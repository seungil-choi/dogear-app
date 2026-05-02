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
}

export function AppImage({ source, style, resizeMode = 'cover' }: AppImageProps) {
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
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <Image
      source={{ uri: source.uri }}
      style={style}
      resizeMode={resizeMode}
    />
  );
}
