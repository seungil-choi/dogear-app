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
import { confirm } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { OK } from '../src/constants/messages';
import type { BlockedUser } from '../src/types';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const blockedUsers = useAppStore(s => s.blockedUsers);
  const unblockUser  = useAppStore(s => s.unblockUser);

  const onUnblock = async (item: BlockedUser) => {
    // 확인 다이얼로그: 제목은 질문, 버튼은 동사 하나로 통일한다
    if (await confirm('이 사용자의 발도장과 사진이 다시 보이게 돼요.', {
      title: '차단을 해제할까요?',
      confirmText: '해제',
    })) {
      unblockUser(item.block_id);
      // 확인을 이미 한 번 눌렀다 — 결과까지 모달로 막지 않는다(§2.1)
      toast.success(OK.unblocked);
    }
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    // 차단 시점에 보관한 강아지 이름 사용(타 강아지 이름은 RLS로 조회 불가)
    const name = item.blocked_dog_name ?? (item.blocked_dog_id ? '차단한 강아지' : '차단한 사용자');
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
