/**
 * 차단한 사용자 관리 (App Store 1.2 UGC 정책 필수)
 *
 * 차단 해제 가능. 차단된 사용자/강아지의 콘텐츠는 홈/지도/상세에서 노출 차단됨.
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import { relativeTime } from '../src/utils/labels';
import { confirm, notify } from '../src/utils/dialog';
import type { BlockedUser } from '../src/types';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const blockedUsers = useAppStore(s => s.blockedUsers);
  const dogs         = useAppStore(s => s.dogs);
  const unblockUser  = useAppStore(s => s.unblockUser);

  const onUnblock = async (item: BlockedUser) => {
    if (await confirm('차단을 해제하면 이 사용자의 콘텐츠가 다시 보여요.', {
      title: '차단 해제',
      confirmText: '해제할게요',
    })) {
      unblockUser(item.block_id);
      notify('차단을 해제했어요. 이 사용자의 콘텐츠가 다시 보입니다.', '차단 해제 완료');
    }
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const dog = item.blocked_dog_id ? dogs.find(d => d.dog_id === item.blocked_dog_id) : null;
    const name = dog?.name ?? '익명 사용자';
    return (
      <View style={s.row}>
        <View style={s.avatar}>
          <Icon name="person" size={20} color={Colors.text.tertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{name}</Text>
          <Text style={s.meta}>{relativeTime(item.blocked_at)} 차단</Text>
        </View>
        <TouchableOpacity style={s.unblockBtn} onPress={() => onUnblock(item)}>
          <Text style={s.unblockText}>해제</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>차단한 사용자</Text>
        <View style={{ width: 40 }} />
      </View>

      {blockedUsers.length === 0 ? (
        <View style={s.empty}>
          <Icon name="person" size={40} color={Colors.text.tertiary} />
          <Text style={s.emptyTitle}>차단한 사용자가 없어요</Text>
          <Text style={s.emptySub}>
            불편한 콘텐츠를 만나면{'\n'}더보기 버튼으로 차단할 수 있어요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={item => item.block_id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.divider} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  list: { padding: Spacing[16] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[12],
    paddingVertical: Spacing[12], paddingHorizontal: Spacing[14],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { ...Typography.title.s, color: Colors.text.primary },
  meta: { ...Typography.body.s, color: Colors.text.tertiary, marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[8],
    borderRadius: Radius.round,
    borderWidth: 1, borderColor: Colors.border.strong,
    backgroundColor: Colors.surface.default,
  },
  unblockText: { ...Typography.label.m, color: Colors.text.primary },
  divider: { height: Spacing[8] },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[32], gap: Spacing[12] },
  emptyTitle: { ...Typography.title.m, color: Colors.text.primary, marginTop: Spacing[8] },
  emptySub: { ...Typography.body.m, color: Colors.text.secondary, textAlign: 'center', lineHeight: 22 },
});
