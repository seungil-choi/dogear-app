/**
 * LocationPermissionGate — 위치 권한 없을 때 표시되는 안내 화면
 *
 * 지도 탭에서 위치 권한이 거부된 경우 대신 렌더링된다.
 * 권한 재요청 또는 설정 앱 이동 옵션을 제공한다.
 */

import React from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/tokens';
import { Icon } from '@/components/common/Icon';

interface LocationPermissionGateProps {
  onRequestPermission: () => void;
}

export function LocationPermissionGate({ onRequestPermission }: LocationPermissionGateProps) {
  function openSettings() {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Icon name="location" size={44} color={Colors.brand.primary} />
        </View>
        <Text style={styles.title}>위치 권한이 필요해요</Text>
        <Text style={styles.description}>
          근처 반려견 산책 스팟을 보려면{'\n'}
          위치 접근 권한을 허용해 주세요
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onRequestPermission}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>권한 허용하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={openSettings}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>설정에서 직접 변경</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          위치 정보는 스팟 탐색에만 사용되며{'\n'}
          서버에 저장되지 않아요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[20],
  },
  card: {
    backgroundColor: Colors.bg.primary,
    borderRadius: Radius.xl,
    padding: Spacing[32],
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    gap: Spacing[12],
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  title: {
    ...Typography.title.l,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  description: {
    ...Typography.body.m,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing[8],
  },
  primaryButton: {
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: Spacing[24],
    paddingVertical: Spacing[14],
    borderRadius: Radius.round,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    ...Typography.body.m,
    color: Colors.text.inverse,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: Spacing[10],
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...Typography.body.m,
    color: Colors.text.tertiary,
  },
  hint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: Spacing[8],
  },
});
