/**
 * 공지사항 상세 (planning/37) — 공지 목록·알림함·푸시에서 진입
 * 내린 공지면 안내 후 목록으로 보낸다(알림함에 옛 알림이 남아 있을 수 있다).
 * 약관 개정 공지는 본문 아래 버튼으로 앱 안 약관 화면(link_path)을 연다.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '../../src/components/common/Icon';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Colors, Typography, Spacing, Layout, Radius } from '../../src/constants/tokens';
import { fetchNotice, Notice, NOTICE_CATEGORY_LABEL, noticeDate } from '../../src/lib/notices';

type State = { kind: 'loading' } | { kind: 'ok'; notice: Notice } | { kind: 'gone' } | { kind: 'error' };

export default function NoticeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = React.useCallback(() => {
    if (!id) return setState({ kind: 'gone' });
    setState({ kind: 'loading' });
    fetchNotice(String(id))
      .then(n => setState(n ? { kind: 'ok', notice: n } : { kind: 'gone' }))
      .catch(e => {
        console.error('[notices] 상세 로드 실패:', e?.message ?? e);
        setState({ kind: 'error' });
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/notices' as any))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="뒤로"
        >
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>공지사항</Text>
        <View style={styles.headerBack} />
      </View>

      {state.kind === 'loading' && (
        <View style={styles.center}><ActivityIndicator color={Colors.brand.primary} /></View>
      )}
      {state.kind === 'gone' && (
        <View style={styles.center}>
          <EmptyState
            headline="게시가 종료된 공지예요"
            ctaLabel="공지사항 목록 보기"
            onCta={() => router.replace('/notices' as any)}
          />
        </View>
      )}
      {state.kind === 'error' && (
        <View style={styles.center}>
          <EmptyState
            headline="공지를 불러오지 못했어요"
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
            ctaLabel="다시 시도"
            onCta={load}
          />
        </View>
      )}
      {state.kind === 'ok' && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[32] }]}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{NOTICE_CATEGORY_LABEL[state.notice.category]}</Text>
          </View>
          <Text style={styles.title}>{state.notice.title}</Text>
          <Text style={styles.date}>{noticeDate(state.notice.published_at)}</Text>
          <View style={styles.divider} />
          <Text style={styles.body} selectable>{state.notice.body}</Text>
          {state.notice.link_path && state.notice.link_label && (
            <TouchableOpacity
              style={styles.linkButton}
              activeOpacity={0.8}
              onPress={() => router.push(state.notice.link_path as any)}
            >
              <Text style={styles.linkText}>{state.notice.link_label}</Text>
              <Icon name="forward" size={18} color={Colors.brand.primary} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  headerBack: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: Layout.screenPadding, paddingTop: Spacing[20] },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[8],
    paddingVertical: 2,
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
    marginBottom: Spacing[8],
  },
  chipText: { ...Typography.caption, color: Colors.text.secondary },
  title: { ...Typography.title.m, color: Colors.text.primary, marginBottom: Spacing[6] },
  date: { ...Typography.caption, color: Colors.text.tertiary },
  divider: { height: 1, backgroundColor: Colors.border.subtle, marginVertical: Spacing[16] },
  body: { ...Typography.body.m, color: Colors.text.primary },
  linkButton: {
    marginTop: Spacing[24],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[14],
    borderRadius: Radius.m,
    borderWidth: 1,
    borderColor: Colors.border.brand,
    backgroundColor: Colors.brand.subtle,
  },
  linkText: { ...Typography.label.m, color: Colors.brand.primary, fontWeight: '700' },
});
