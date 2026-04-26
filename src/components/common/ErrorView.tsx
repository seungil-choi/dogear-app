/**
 * ErrorView — 에러 상태 컴포넌트
 *
 * 네트워크 오류, 데이터 조회 실패 등에 사용한다.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/tokens';

interface ErrorViewProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorView({
  message = '정보를 불러오지 못했어요',
  onRetry,
  compact = false,
}: ErrorViewProps) {
  if (compact) {
    return (
      <View style={styles.compact}>
        <Text style={styles.compactText}>{message}</Text>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.compactRetry}>
            <Text style={styles.compactRetryText}>다시 시도</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>😕</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[20],
    gap: Spacing[12],
  },
  emoji: {
    fontSize: 40,
  },
  message: {
    ...Typography.body.m,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: Spacing[20],
    paddingVertical: Spacing[10],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.brand.primary,
  },
  retryText: {
    ...Typography.body.m,
    color: Colors.brand.primary,
    fontWeight: '600',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
    paddingVertical: Spacing[8],
    paddingHorizontal: Spacing[16],
  },
  compactText: {
    ...Typography.body.s,
    color: Colors.text.secondary,
  },
  compactRetry: {
    paddingHorizontal: Spacing[8],
  },
  compactRetryText: {
    ...Typography.body.s,
    color: Colors.brand.primary,
    fontWeight: '600',
  },
});
