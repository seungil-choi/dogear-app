/**
 * AppImage — 크로스플랫폼 이미지 컴포넌트
 *
 * - 웹: HTML <img> 직접 사용 (RNW Image / expo-image 둘 다 웹에서 렌더링 실패)
 * - 네이티브: react-native Image
 * - 로드 실패(호스트 장애·404 등) 시 깨진 이미지 대신 브랜드 플레이스홀더로 폴백
 */
import React, { useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import type { StyleProp, ImageStyle } from 'react-native';
import { Colors } from '../../constants/tokens';
import { Icon } from './Icon';

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
  const [errored, setErrored] = useState(false);

  // uri 자체가 없으면 이미지 영역 없음(의도된 상태)
  if (!source?.uri) return null;

  // 로드 실패 → 브랜드 플레이스홀더(깨진 이미지 방지)
  if (errored) {
    return (
      <View
        style={[style, s.fallback]}
        accessible={!decorative}
        accessibilityLabel={decorative ? undefined : (accessibilityLabel ?? '이미지를 불러올 수 없어요')}
        accessibilityRole={decorative ? 'none' : 'image'}
        accessibilityElementsHidden={decorative}
        importantForAccessibility={decorative ? 'no' : 'auto'}
      >
        <Icon name="paw" size={28} color={Colors.text.tertiary} />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    const flat = StyleSheet.flatten(style) as React.CSSProperties | undefined;
    const objectFit: React.CSSProperties['objectFit'] =
      resizeMode === 'stretch' ? 'fill' :
      resizeMode === 'center' ? 'none' : resizeMode as any;
    return (
      // @ts-ignore — web only
      <img
        src={source.uri}
        onError={() => setErrored(true)}
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
      onError={() => setErrored(true)}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? 'none' : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no' : 'auto'}
    />
  );
}

const s = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
  },
});
