/**
 * 공지사항 목록 (planning/37) — 마이페이지 [공지사항]에서 진입
 * 고정 공지 먼저, 그다음 게시일 최신순. 약관 개정 고지도 여기에 올라온다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '../../src/components/common/Icon';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Colors, Typography, Spacing, Layout, Radius } from '../../src/constants/tokens';
import { fetchNotices, Notice, NOTICE_CATEGORY_LABEL, noticeDate } from '../../src/lib/notices';

export default function NoticesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotices(await fetchNotices());
      setFailed(false);
    } catch (e: any) {
      console.error('[notices] 목록 로드 실패:', e?.message ?? e);
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="뒤로"
        >
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>공지사항</Text>
        <View style={styles.headerBack} />
      </View>

      {notices === null && !failed ? (
        <View style={styles.center}><ActivityIndicator color={Colors.brand.primary} /></View>
      ) : failed && !notices ? (
        <View style={styles.center}>
          <EmptyState
            headline="공지사항을 불러오지 못했어요"
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
            ctaLabel="다시 시도"
            onCta={() => { setNotices(null); setFailed(false); load(); }}
          />
        </View>
      ) : notices && notices.length === 0 ? (
        <View style={styles.center}>
          <EmptyState headline="아직 공지사항이 없어요" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing[16] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.primary} />}
        >
          {notices!.map(n => (
            <TouchableOpacity
              key={n.notice_id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push(`/notices/${n.notice_id}` as any)}
            >
              <View style={styles.rowTop}>
                {n.is_pinned && (
                  <View style={[styles.chip, styles.chipPinned]}>
                    <Text style={[styles.chipText, styles.chipPinnedText]}>고정</Text>
                  </View>
                )}
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{NOTICE_CATEGORY_LABEL[n.category]}</Text>
                </View>
              </View>
              <Text style={styles.title} numberOfLines={2}>{n.title}</Text>
              <Text style={styles.date}>{noticeDate(n.published_at)}</Text>
            </TouchableOpacity>
          ))}
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
  row: {
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing[16],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
    gap: Spacing[6],
  },
  rowTop: { flexDirection: 'row', gap: Spacing[6] },
  chip: {
    paddingHorizontal: Spacing[8],
    paddingVertical: 2,
    borderRadius: Radius.round,
    backgroundColor: Colors.bg.secondary,
  },
  chipText: { ...Typography.caption, color: Colors.text.secondary },
  chipPinned: { backgroundColor: Colors.brand.subtle },
  chipPinnedText: { color: Colors.brand.primary, fontWeight: '700' },
  title: { ...Typography.body.m, fontWeight: '600', color: Colors.text.primary },
  date: { ...Typography.caption, color: Colors.text.tertiary },
});
