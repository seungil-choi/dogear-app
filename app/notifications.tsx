/**
 * 알림함 (planning/38 P0-3 — 2026-10-16 고도화)
 *
 * 원칙: **눌러서 아무 일도 안 일어나는 알림은 없다.**
 *   - 이동할 곳이 있으면 그 화면으로(공지 → 공지 상세, 조치 → 조치 내역, 익숙한 강아지 → 장소, 어드민 푸시 → 지정 경로)
 *   - 이동할 곳이 없으면 그 자리에서 펼쳐 전문을 보여준다(신한 SOL '더보기' 방식)
 *   - 주간 산책 요약은 「이번 주 기록 보기」로 발도장 탭에 잇는다
 *   예전엔 주간 요약에 이동처가 없어 눌러도 읽음만 되고, 본문은 2줄에서 잘렸다.
 *
 * 레퍼런스(UI Bowl): 당근 — 맨 위 유형 라벨·⋮ 개별 관리·설정 톱니 / 크몽·신한 — 분류 칩 / 신한 — 펼치기.
 * 썸네일은 넣지 않는다 — 익숙한 강아지 알림에 장소 사진이 붙으면 어디에 다녀갔는지가 드러난다(SEC-09).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, type IconName } from '../src/components/common/Icon';
import { EmptyState } from '../src/components/common/EmptyState';
import { Colors, Typography, Spacing, Layout, Radius } from '../src/constants/tokens';
import { supabase } from '../src/lib/supabase';
import { relativeTime } from '../src/utils/labels';
import { actionSheet } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { reportError } from '../src/utils/errorReporter';
import { IS_DEV_SEED as SHOW_MOCK, IS_REAL_AUTH } from '../src/config/env';

// ─── 유형 ─────────────────────────────────────────────────────
type Filter = 'all' | 'walk' | 'info';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'walk', label: '산책 소식' },
  { key: 'info', label: '공지·안내' },
];

const TYPE_META: Record<string, { label: string; icon: IconName; filter: Exclude<Filter, 'all'> }> = {
  familiar_dog_visited: { label: '익숙한 강아지', icon: 'paw', filter: 'walk' },
  weekly_summary:       { label: '주간 산책 요약', icon: 'star', filter: 'walk' },
  saved_spot_update:    { label: '저장한 장소', icon: 'bookmark', filter: 'walk' },
  notice:               { label: '공지', icon: 'megaphone', filter: 'info' },
  admin_push:           { label: '안내', icon: 'bell', filter: 'info' },
  moderation_notice:    { label: '운영 안내', icon: 'warning', filter: 'info' },
};
const FALLBACK_META = { label: '알림', icon: 'bell' as IconName, filter: 'info' as const };

/** 앱 안 경로만 따라간다 — 외부 주소·스킴은 무시 */
const APP_PATH = /^\/[A-Za-z0-9/_\-()]*(\?[A-Za-z0-9_\-=&]*)?$/;

type Group = '오늘' | '어제' | '이번 주' | '이전';
const GROUP_ORDER: Group[] = ['오늘', '어제', '이번 주', '이전'];

function groupOf(iso: string): Group {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate() - 1);
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);
  if (d >= startToday) return '오늘';
  if (d >= startYesterday) return '어제';
  if (d >= startWeek) return '이번 주';
  return '이전';   // 약관 개정 공지처럼 오래 남는 알림이 '이번 주'에 섞이지 않게
}

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** 누르면 갈 곳. 없으면 펼치기 */
  target?: string;
  /** 본문 아래 버튼(이동처를 문장으로 보여줄 때) */
  cta?: { label: string; path: string };
}

function toItem(n: any): Item {
  const d = n.data ?? {};
  let target: string | undefined;
  let cta: Item['cta'];
  if (d.notice_id) target = `/notices/${d.notice_id}`;
  else if (d.action_id) target = `/moderation-notices?actionId=${d.action_id}`;
  else if (d.spot_id) target = `/spot/${d.spot_id}`;
  else if (typeof d.path === 'string' && APP_PATH.test(d.path)) target = d.path;
  if (n.type === 'weekly_summary') cta = { label: '이번 주 기록 보기', path: '/(tabs)/paw' };
  return {
    id: n.notification_id, type: n.type, title: n.title, body: n.body,
    createdAt: n.created_at, read: !!n.read_at, target, cta,
  };
}

const MOCK: Item[] = [
  { id: 'm1', type: 'notice', title: '서비스 이용약관 개정 안내', body: '11월 20일부터 개정 약관이 적용됩니다. 주요 변경 내용을 확인해 주세요.', createdAt: new Date().toISOString(), read: false, target: '/notices' },
  { id: 'm2', type: 'weekly_summary', title: '이번 주 산책 요약', body: '이번 주 3곳에서 5번 발도장을 남겼어요. 이번 주도 수고했어요!', createdAt: new Date(Date.now() - 86400000).toISOString(), read: false, cta: { label: '이번 주 기록 보기', path: '/(tabs)/paw' } },
  { id: 'm3', type: 'familiar_dog_visited', title: '익숙한 강아지가 다녀갔어요', body: '자주 보이는 강아지가 근처에 다녀갔어요.', createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), read: true, target: '/(tabs)/map' },
];

// ─── 화면 ─────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[] | null>(SHOW_MOCK ? MOCK : null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!IS_REAL_AUTH) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('notification_id, type, title, body, data, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      reportError(new Error(`notifications load failed: ${error.message}`), 'handled');
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems((data ?? []).map(toItem));
  }, []);

  // 화면에 돌아올 때마다(공지를 읽고 돌아온 경우 포함) 다시 읽는다
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markRead = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setItems(prev => prev?.map(n => (ids.includes(n.id) ? { ...n, read: true } : n)) ?? prev);
    if (!IS_REAL_AUTH) return;
    supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('notification_id', ids)
      .then(({ error }) => { if (error) reportError(new Error(`notifications read failed: ${error.message}`), 'handled'); });
  }, []);

  const handleMarkAllRead = () => markRead((items ?? []).filter(n => !n.read).map(n => n.id));

  const handlePress = (item: Item) => {
    if (!item.read) markRead([item.id]);
    if (item.target) { router.push(item.target as any); return; }
    // 이동할 곳이 없으면 그 자리에서 펼친다
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      return next;
    });
  };

  const handleMore = async (item: Item) => {
    const idx = await actionSheet(TYPE_META[item.type]?.label ?? '알림', [
      { label: '이런 알림 받지 않기' },
      { label: '이 알림 삭제', destructive: true },
    ]);
    if (idx === 0) { router.push('/notification-settings' as any); return; }
    if (idx !== 1) return;
    const before = items;
    setItems(prev => prev?.filter(n => n.id !== item.id) ?? prev);
    if (!IS_REAL_AUTH) return;
    const { error } = await supabase.from('notifications').delete().eq('notification_id', item.id);
    if (error) {
      setItems(before);
      reportError(new Error(`notification delete failed: ${error.message}`), 'handled');
      toast.error('알림을 지우지 못했어요. 잠시 후 다시 시도해 주세요');
    }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const visible = useMemo(
    () => (items ?? []).filter(n => filter === 'all' || (TYPE_META[n.type] ?? FALLBACK_META).filter === filter),
    [items, filter],
  );
  const grouped = useMemo(() => {
    const g: Record<Group, Item[]> = { '오늘': [], '어제': [], '이번 주': [], '이전': [] };
    for (const n of visible) g[groupOf(n.createdAt)].push(n);
    return g;
  }, [visible]);
  const hasUnread = (items ?? []).some(n => !n.read);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="뒤로">
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>알림</Text>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => router.push('/notification-settings' as any)}
          hitSlop={8}
          accessibilityLabel="알림 설정"
        >
          <Icon name="settings" size={22} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* 분류 칩 + 모두 읽음 */}
      <View style={s.toolbar}>
        <View style={s.chips}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, filter === f.key && s.chipOn]}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.key }}
            >
              <Text style={[s.chipText, filter === f.key && s.chipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={handleMarkAllRead} disabled={!hasUnread} hitSlop={8}>
          <Text style={[s.markAll, !hasUnread && s.markAllOff]}>모두 읽음</Text>
        </TouchableOpacity>
      </View>

      {items === null && !failed ? (
        <View style={s.center}><ActivityIndicator color={Colors.brand.primary} /></View>
      ) : failed && !items ? (
        <View style={s.center}>
          <EmptyState headline="알림을 불러오지 못했어요" description="네트워크 상태를 확인한 뒤 다시 시도해 주세요." ctaLabel="다시 시도" onCta={load} />
        </View>
      ) : visible.length === 0 ? (
        <View style={s.center}>
          {filter === 'all' ? (
            <EmptyState
              headline="아직 도착한 알림이 없어요"
              description="발도장이 쌓이고 익숙한 강아지가 등장하면 여기로 알려드릴게요."
              ctaLabel="지도 보기"
              onCta={() => router.replace('/(tabs)/map')}
            />
          ) : (
            <EmptyState headline="이 분류의 알림이 없어요" />
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing[16] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {GROUP_ORDER.map(group => {
            const list = grouped[group];
            if (!list.length) return null;
            return (
              <View key={group}>
                <Text style={s.groupLabel}>{group}</Text>
                {list.map(n => {
                  const meta = TYPE_META[n.type] ?? FALLBACK_META;
                  const open = expanded.has(n.id);
                  const expandable = !n.target;
                  return (
                    <TouchableOpacity
                      key={n.id}
                      style={[s.item, !n.read && s.itemUnread]}
                      onPress={() => handlePress(n)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityHint={n.target ? '눌러서 자세히 보기' : open ? '눌러서 접기' : '눌러서 펼치기'}
                    >
                      <View style={s.dotCol}>{!n.read && <View style={s.dot} />}</View>
                      <View style={s.iconWrap}>
                        <Icon name={meta.icon} size={18} color={Colors.brand.primary} />
                      </View>
                      <View style={s.textCol}>
                        <View style={s.metaRow}>
                          <Text style={s.typeLabel}>{meta.label}</Text>
                          <Text style={s.time}>{relativeTime(n.createdAt)}</Text>
                        </View>
                        <Text style={s.title} numberOfLines={open ? undefined : 1}>{n.title}</Text>
                        <Text style={s.body} numberOfLines={open ? undefined : 2}>{n.body}</Text>
                        {n.cta && (
                          <TouchableOpacity
                            style={s.cta}
                            onPress={() => { if (!n.read) markRead([n.id]); router.push(n.cta!.path as any); }}
                            accessibilityRole="button"
                          >
                            <Text style={s.ctaText}>{n.cta.label}</Text>
                            <Icon name="forward" size={14} color={Colors.brand.primary} />
                          </TouchableOpacity>
                        )}
                        {expandable && !n.cta && n.body.length > 60 && (
                          <Text style={s.expand}>{open ? '접기' : '더보기'}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={s.moreBtn}
                        onPress={() => handleMore(n)}
                        hitSlop={8}
                        accessibilityLabel="알림 메뉴"
                      >
                        <Icon name="more" size={18} color={Colors.text.tertiary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16], borderBottomWidth: 1, borderBottomColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding, paddingVertical: Spacing[10],
  },
  chips: { flexDirection: 'row', gap: Spacing[6] },
  chip: {
    paddingHorizontal: Spacing[12], paddingVertical: Spacing[6], borderRadius: Radius.round,
    borderWidth: 1, borderColor: Colors.border.default, backgroundColor: Colors.surface.default,
  },
  chipOn: { backgroundColor: Colors.text.primary, borderColor: Colors.text.primary },
  chipText: { ...Typography.label.m, color: Colors.text.secondary },
  chipTextOn: { color: Colors.text.inverse, fontWeight: '700' },
  markAll: { ...Typography.label.m, color: Colors.brand.primary },
  markAllOff: { color: Colors.text.tertiary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  groupLabel: {
    ...Typography.label.s, color: Colors.text.tertiary,
    paddingHorizontal: Layout.screenPadding, paddingTop: Spacing[12], paddingBottom: Spacing[6],
  },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing[14], paddingRight: Spacing[8],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle, backgroundColor: Colors.surface.default,
  },
  itemUnread: { backgroundColor: Colors.brand.subtle },
  dotCol: { width: 16, alignItems: 'center', paddingTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.brand.primary },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing[12],
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  textCol: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeLabel: { ...Typography.caption, color: Colors.text.tertiary, fontWeight: '600' },
  time: { ...Typography.caption, color: Colors.text.tertiary },
  title: { ...Typography.label.m, fontWeight: '700', color: Colors.text.primary },
  body: { ...Typography.body.s, color: Colors.text.secondary },
  cta: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2,
    marginTop: Spacing[6], paddingVertical: Spacing[4],
  },
  ctaText: { ...Typography.label.m, color: Colors.brand.primary, fontWeight: '700' },
  expand: { ...Typography.caption, color: Colors.brand.primary, marginTop: Spacing[2] },
  moreBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
