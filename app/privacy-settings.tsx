import React from 'react';
import {
  View, Text, Switch, TouchableOpacity,
  ScrollView, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { PrivacyChip } from '../src/components/common/StatusBadge';
import { Icon } from '../src/components/common/Icon';
import type { VisibilityLevel } from '../src/types';

const VISIBILITY_LEVELS: VisibilityLevel[] = ['private', 'spot_only', 'familiar_layer'];

const LEVEL_DESC: Record<VisibilityLevel, { title: string; desc: string }> = {
  private: {
    title: '나만 보기',
    desc: '내 발도장은 나만 볼 수 있어요. 장소 분위기나 익숙한 강아지 통계에도 전혀 반영되지 않아요.',
  },
  spot_only: {
    title: '장소 분위기에만',
    desc: '장소의 분위기 통계에만 보태져요. 우리 아이 정보는 어디에도 나오지 않아요.',
  },
  familiar_layer: {
    title: '산책 친구 찾기',
    desc: '안전 조건을 모두 충족했을 때만, 자주 마주치는 강아지에게 최소한의 정보로 소개돼요.',
  },
};

const SAFETY_CONDITIONS = [
  '두 강아지 모두 최근 14일 안에 같은 장소를 방문했어요',
  '두 강아지 모두 최근 7일 안에 같은 장소를 2회 이상 방문했어요',
  '두 강아지 모두 "익숙한 강아지" 공개를 허용해두었어요',
  '두 강아지 모두 "자주 만나는 강아지에게 보이기"를 켜둔 상태예요',
  '최근 7일 안에 같은 장소에서 발도장이 겹친 적 있어요',
  '같은 크기의 강아지만 보기로 설정했다면, 두 강아지의 크기가 같아야 해요',
];

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const privacySetting = useAppStore(s => s.privacySetting);
  const updatePrivacySetting = useAppStore(s => s.updatePrivacySetting);

  return (
    <SafeAreaView style={s.safe}>
      {/* 내비 헤더 */}
      <View style={s.navbar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          accessibilityLabel="뒤로가기"
          accessibilityRole="button"
        >
          <Icon name="back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>공개 범위 설정</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* 기본 공개 범위 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>기본 공개 범위</Text>
          <Text style={s.sectionDesc}>
            발도장마다 직접 바꿀 수 있어요. 여기선 기본값만 정해두세요.
          </Text>
          <View style={s.levelList}>
            {VISIBILITY_LEVELS.map(level => (
              <TouchableOpacity
                key={level}
                style={[
                  s.levelItem,
                  privacySetting.default_visibility_level === level && s.levelItemSelected,
                ]}
                onPress={() => updatePrivacySetting({ default_visibility_level: level })}
              >
                <View style={s.levelHeader}>
                  <PrivacyChip level={level} selected={privacySetting.default_visibility_level === level} />
                </View>
                <Text style={s.levelDesc}>{LEVEL_DESC[level].desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 익숙한 레이어 허용 여부 */}
        <View style={s.section}>
          <View style={s.switchRow}>
            <View style={s.switchInfo}>
              <Text style={s.switchLabel}>자주 만나는 강아지에게 보이기</Text>
              <Text style={s.switchDesc}>
                안전 조건을 모두 충족한 경우에만, 같은 장소를 자주 찾는 강아지에게 우리 아이가 소개돼요
              </Text>
            </View>
            <Switch
              value={privacySetting.allow_familiar_layer_exposure}
              onValueChange={v => updatePrivacySetting({ allow_familiar_layer_exposure: v })}
              trackColor={{ false: Colors.border.default, true: Colors.brand.primaryLight }}
              thumbColor={privacySetting.allow_familiar_layer_exposure ? Colors.brand.primary : Colors.bg.secondary}
            />
          </View>
        </View>

        {/* 안전 조건 안내 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="lock" size={16} color={Colors.text.primary} />
            <Text style={s.sectionTitle}>산책 친구 안전 조건 6가지</Text>
          </View>
          <Text style={s.sectionDesc}>
            아래 조건을 모두 충족해야만 산책 친구 찾기가 작동해요.
          </Text>
          <View style={s.conditionList}>
            {SAFETY_CONDITIONS.map((cond, i) => (
              <View key={i} style={s.conditionItem}>
                <View style={s.conditionDot} />
                <Text style={s.conditionText}>{cond}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[8],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  backBtn: { padding: Spacing[12], width: 44 },
  navTitle: { flex: 1, ...Typography.title.s, color: Colors.text.primary, textAlign: 'center' },

  scroll: { flex: 1 },
  content: { padding: Spacing[16], gap: Spacing[24], paddingBottom: Spacing[48] },

  section: { gap: Spacing[12] },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  sectionTitle: { ...Typography.title.s, color: Colors.text.primary },
  sectionDesc: { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },

  // Visibility level list
  levelList: { gap: Spacing[8] },
  levelItem: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    padding: Spacing[14],
    borderWidth: 1.5,
    borderColor: Colors.border.subtle,
    gap: Spacing[8],
  },
  levelItemSelected: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.subtle,
  },
  levelHeader: { flexDirection: 'row' },
  levelDesc: { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },

  // Toggle row
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    padding: Spacing[16],
    gap: Spacing[12],
  },
  switchInfo: { flex: 1, gap: Spacing[4] },
  switchLabel: { ...Typography.label.l, color: Colors.text.primary },
  switchDesc: { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },

  // Conditions
  conditionList: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    padding: Spacing[14],
    gap: Spacing[10],
  },
  conditionItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[10] },
  conditionDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.brand.primary,
    marginTop: 7,
    flexShrink: 0,
  },
  conditionText: { flex: 1, ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },
});
