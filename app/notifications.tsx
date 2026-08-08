import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '../src/components/common/Icon';
import { EmptyState } from '../src/components/common/EmptyState';
import { Colors, Typography, Spacing, Layout } from '../src/constants/tokens';
import { supabase } from '../src/lib/supabase';
import { relativeTime } from '../src/utils/labels';

// DEV_SEED 모드에서만 데모 알림 노출 (실 환경에서는 서버에서 로드)
import { IS_DEV_SEED as SHOW_MOCK, IS_REAL_AUTH } from '../src/config/env';

// 알림 타입 → 아이콘
const ICON_BY_TYPE: Record<string, string> = {
  familiar_dog_visited: 'paw',
  weekly_summary: 'star',
  saved_spot_update: 'bookmark',
};

// created_at → 그룹(오늘/어제/이번 주)
function groupOf(iso: string): NotificationGroup {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (d >= startToday) return '오늘';
  if (d >= startYesterday) return '어제';
  return '이번 주';
}

// ─── 타입 정의 ──────────────────────────────────────────────────
type NotificationGroup = '오늘' | '어제' | '이번 주';

interface NotificationItem {
  id: string;
  group: NotificationGroup;
  icon: string;
  title: string;
  desc: string;
  time: string;
  read: boolean;
  spot_id?: string;  // 연결된 장소가 있으면 탭 시 장소 상세로 이동
}

// ─── Mock 데이터 ────────────────────────────────────────────────
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    group: '오늘',
    icon: 'paw',
    title: '새 발도장이 남겨졌어요',
    desc: '즐겨찾는 "한강 망원지구"에 새로운 발도장이 2개 추가됐어요.',
    time: '방금 전',
    read: false,
    spot_id: 'spot-001',
  },
  {
    id: '2',
    group: '오늘',
    icon: 'bell',
    title: '발도장이 기록됐어요',
    desc: '"성수 서울숲 산책로" 방문이 기록됐어요. 오늘도 즐거운 산책이었나요?',
    time: '1시간 전',
    read: false,
    spot_id: 'spot-002',
  },
  {
    id: '3',
    group: '어제',
    icon: 'star',
    title: '장소가 인기 스팟이 됐어요',
    desc: '내가 등록한 "망원 한강공원"이 이번 주 인기 장소에 선정됐어요.',
    time: '어제 오후 3:24',
    read: false,
    spot_id: 'spot-003',
  },
  {
    id: '4',
    group: '어제',
    icon: 'bookmark',
    title: '저장한 곳이 업데이트됐어요',
    desc: '"뚝섬 한강공원" 장소에 새로운 사진과 정보가 업데이트됐어요.',
    time: '어제 오전 10:05',
    read: true,
    spot_id: 'spot-004',
  },
  {
    id: '5',
    group: '이번 주',
    icon: 'info',
    title: '서비스 점검 안내',
    desc: '4월 27일(일) 오전 2시~4시에 서버 점검이 예정되어 있어요.',
    time: '3일 전',
    read: true,
  },
];

// ─── 그룹 순서 ───────────────────────────────────────────────────
const GROUP_ORDER: NotificationGroup[] = ['오늘', '어제', '이번 주'];

// ─── 메인 컴포넌트 ──────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<NotificationItem[]>(SHOW_MOCK ? MOCK_NOTIFICATIONS : []);

  // 실 환경: 서버 notifications 테이블에서 로드
  useEffect(() => {
    if (!IS_REAL_AUTH) return;
    (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!data) return;
      setNotifications(data.map((n: any) => ({
        id: n.notification_id,
        group: groupOf(n.created_at),
        icon: ICON_BY_TYPE[n.type] ?? 'bell',
        title: n.title,
        desc: n.body,
        time: relativeTime(n.created_at),
        read: !!n.read_at,
        spot_id: n.data?.spot_id,
      })));
    })();
  }, []);

  // 모두 읽음 처리
  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (IS_REAL_AUTH) {
      // 화면은 이미 읽음으로 바꿔놨다. 서버 쓰기가 조용히 실패하면 다음 진입 때
      // 배지가 되살아나는데 원인을 알 길이 없으므로 실패는 남긴다.
      supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
        .then(({ error }) => {
          if (error) console.error('[notifications] 모두 읽음 처리 실패:', error.message);
        });
    }
  };

  // 개별 알림 클릭 — 읽음 처리 + 연결 장소로 이동
  const handlePressItem = (item: NotificationItem) => {
    setNotifications(prev =>
      prev.map(n => (n.id === item.id ? { ...n, read: true } : n))
    );
    if (IS_REAL_AUTH && !item.read) {
      supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('notification_id', item.id)
        .then(({ error }) => {
          if (error) console.error('[notifications] 읽음 처리 실패:', error.message);
        });
    }
    if (item.spot_id) {
      router.push(`/spot/${item.spot_id}`);
    }
  };

  // 그룹별 알림 분류
  const groupedNotifications = GROUP_ORDER.reduce<Record<NotificationGroup, NotificationItem[]>>(
    (acc, group) => {
      acc[group] = notifications.filter(n => n.group === group);
      return acc;
    },
    { '오늘': [], '어제': [], '이번 주': [] }
  );

  const hasUnread = notifications.some(n => !n.read);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>알림</Text>

        <TouchableOpacity
          style={styles.headerMarkAllButton}
          onPress={handleMarkAllRead}
          disabled={!hasUnread}
        >
          <Text style={[styles.headerMarkAllText, !hasUnread && styles.headerMarkAllTextDisabled]}>
            모두 읽음
          </Text>
        </TouchableOpacity>
      </View>

      {/* 콘텐츠 */}
      {notifications.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            headline="아직 도착한 알림이 없어요"
            description="발도장이 쌓이고 익숙한 강아지가 등장하면 여기로 알려드릴게요."
            ctaLabel="지도 보기"
            onCta={() => router.replace('/(tabs)/map')}
          />
        </View>
      ) : (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing[16] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {GROUP_ORDER.map(group => {
          const items = groupedNotifications[group];
          if (items.length === 0) return null;

          return (
            <View key={group} style={styles.group}>
              {/* 날짜 그룹 헤더 */}
              <Text style={styles.groupLabel}>{group}</Text>

              {/* 알림 목록 */}
              {items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.notificationItem,
                    item.read ? styles.notificationItemRead : styles.notificationItemUnread,
                  ]}
                  onPress={() => handlePressItem(item)}
                  activeOpacity={0.7}
                >
                  {/* 읽지 않음 dot */}
                  <View style={styles.dotContainer}>
                    {!item.read && <View style={styles.unreadDot} />}
                  </View>

                  {/* 아이콘 원형 배경 */}
                  <View style={styles.iconWrapper}>
                    <Icon name={item.icon as any} size={18} color={Colors.brand.primary} />
                  </View>

                  {/* 텍스트 영역 */}
                  <View style={styles.textArea}>
                    <Text style={styles.notificationTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.notificationDesc} numberOfLines={2}>
                      {item.desc}
                    </Text>
                  </View>

                  {/* 시간 */}
                  <Text style={styles.notificationTime}>{item.time}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── 스타일 ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },

  // 헤더
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  headerBackButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...Typography.title.m,
    color: Colors.text.primary,
  },
  headerMarkAllButton: {
    width: 72,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerMarkAllText: {
    ...Typography.label.m,
    color: Colors.brand.primary,
  },
  headerMarkAllTextDisabled: {
    color: Colors.text.tertiary,
  },

  // 스크롤
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing[8],
  },

  // 그룹
  group: {
    marginBottom: Spacing[8],
  },
  groupLabel: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: Spacing[8],
  },

  // 알림 아이템
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing[14],
    paddingRight: Spacing[16],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  notificationItemRead: {
    backgroundColor: Colors.surface.default,
  },
  notificationItemUnread: {
    backgroundColor: Colors.brand.subtle,
  },

  // 읽지 않음 dot
  dotContainer: {
    width: 16,
    alignItems: 'center',
    paddingTop: 6,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand.primary,
  },

  // 아이콘 원형
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.brand.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing[12],
    flexShrink: 0,
  },

  // 텍스트
  textArea: {
    flex: 1,
    marginRight: Spacing[8],
  },
  notificationTitle: {
    ...Typography.label.m,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing[2],
  },
  notificationDesc: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },

  // 시간
  notificationTime: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    flexShrink: 0,
    marginTop: 1,
  },
});
