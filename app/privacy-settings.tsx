import React from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { Icon } from '../src/components/common/Icon';
import { SAFETY_CONDITION_TEXTS } from '../src/config/familiar-layer';



// 안전 조건은 src/config/familiar-layer.ts SSOT에서 import
const SAFETY_CONDITIONS = SAFETY_CONDITION_TEXTS;

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
        <Text style={s.navTitle}>우리 아이 공개 설정</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* ── 유일한 공개 컨트롤 ──
            예전엔 3단계 '기본 공개 범위'와 이 토글이 함께 있었다. 서버가 둘을 AND로
            봐서 범위를 골라도 토글이 꺼져 있으면 조용히 제외됐고, 화면엔 그 사실이
            없었다. 이제 이 스위치 하나가 신원 노출을 정한다(즉시·소급). */}
        <View style={s.section}>
          <View style={s.switchRow}>
            <View style={s.switchInfo}>
              <Text style={s.switchLabel}>우리 아이 프로필 공개</Text>
              <Text style={s.switchDesc}>
                켜면 같은 장소를 자주 찾는 강아지에게 우리 아이 프로필(이름·사진·견종·성격)이 소개돼요.
                끄면 프로필 없이 기록만 남아요. 장소 분위기에는 보태지고, 우리 아이는 아무에게도 보이지 않아요.
              </Text>
            </View>
            <Switch
              value={privacySetting.allow_familiar_layer_exposure}
              onValueChange={v => { void updatePrivacySetting({ allow_familiar_layer_exposure: v }); }}
              trackColor={{ false: Colors.border.default, true: Colors.brand.primaryLight }}
              thumbColor={privacySetting.allow_familiar_layer_exposure ? Colors.brand.primary : Colors.bg.secondary}
            />
          </View>
        </View>

        {/* 안전 조건 안내 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Icon name="lock" size={16} color={Colors.text.primary} />
            <Text style={s.sectionTitle}>산책 친구 안전 조건</Text>
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
