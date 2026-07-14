/**
 * ErrorBoundary — 전역 크래시 catch
 *
 * production에서 React 렌더링 트리에 던져진 예외를 잡아 흰 화면 대신
 * "다시 시도" UI를 표시한다. dev 모드는 Metro RedBox가 우선.
 *
 * 동작:
 *  1) componentDidCatch에서 analytics `unexpected_error_caught` 발사 (PII 방어)
 *  2) "다시 시도" → 상태 초기화 (자식 re-render 시도)
 *  3) "홈으로" → router.replace('/(tabs)') (선택, navigate prop 통해)
 *
 * 사용: app/_layout.tsx 최상단에서 <ErrorBoundary>{children}</ErrorBoundary>
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { Icon } from './Icon';
import { track, EVENT } from '../../utils/analytics';
import { IS_REAL_AUTH as IS_REAL } from '../../config/env';

interface Props {
  children: React.ReactNode;
  /** 선택: "홈으로" 버튼 핸들러 (없으면 버튼 숨김) */
  onResetToHome?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: `${error?.name ?? 'Error'}: ${error?.message ?? 'Unknown error'}`.slice(0, 200),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // analytics — fire-and-forget
    try {
      track(EVENT.unexpected_error_caught, {
        screen_name: 'error_boundary',
        error_message: (error?.message ?? 'unknown').slice(0, 100),
        // component stack 첫 줄만 (PII / 코드 노출 최소화)
        component_stack: (info?.componentStack ?? '').split('\n')[0]?.slice(0, 100) ?? '',
      });
    } catch {
      // analytics 실패는 무시
    }

    if (!IS_REAL) {
      // dev: 콘솔에 자세히
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onResetToHome?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.iconWrap}>
            <Icon name="warning" size={40} color={Colors.brand.primary} />
          </View>
          <Text style={s.title} accessibilityRole="header">
            예상치 못한 오류가 발생했어요
          </Text>
          <Text style={s.desc}>
            잠시 후 다시 시도해주세요. 문제가 반복되면 [내 정보 → 고객센터]로 알려주시면 빠르게 살펴볼게요.
          </Text>

          {/* 디버그 에러 메시지는 개발 모드에서만 노출 (실사용자에겐 친절 메시지만) */}
          {!IS_REAL && this.state.errorMessage && (
            <View style={s.devBox}>
              <Text style={s.devLabel}>에러 메시지(디버그)</Text>
              <Text style={s.devMsg}>{this.state.errorMessage}</Text>
            </View>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={this.handleRetry}
              accessibilityRole="button"
              accessibilityLabel="다시 시도"
            >
              <Text style={s.primaryBtnText}>다시 시도</Text>
            </TouchableOpacity>
            {this.props.onResetToHome && (
              <TouchableOpacity
                style={s.secondaryBtn}
                onPress={this.handleGoHome}
                accessibilityRole="button"
                accessibilityLabel="홈으로"
              >
                <Text style={s.secondaryBtnText}>홈으로</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  content: {
    flexGrow: 1,
    padding: Spacing[32],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[16],
  },
  iconWrap: {
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[8],
  },
  title: {
    ...Typography.title.l,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  desc: {
    ...Typography.body.m,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  devBox: {
    width: '100%',
    maxWidth: 400,
    marginTop: Spacing[12],
    padding: Spacing[12],
    borderRadius: Radius.m,
    backgroundColor: Colors.status.error.bg,
    borderWidth: 1,
    borderColor: Colors.status.error.text,
  },
  devLabel: {
    ...Typography.label.s,
    color: Colors.status.error.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  devMsg: {
    ...Typography.body.s,
    color: Colors.text.primary,
    fontFamily: 'monospace',
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing[12],
    marginTop: Spacing[12],
    width: '100%',
    maxWidth: 320,
  },
  primaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: {
    ...Typography.title.m,
    color: Colors.brand.onPrimary,
  },
  secondaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.round,
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: {
    ...Typography.title.m,
    color: Colors.text.primary,
  },
});
