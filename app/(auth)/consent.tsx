/**
 * 약관 동의 화면 (회원가입 직후, 강아지 등록 직전)
 *
 * 개인정보보호법/위치정보법 대응 — 항목별 분리 동의 (필수 3 + 선택 1)
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { notify } from '../../src/utils/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../../src/constants/tokens';
import { Icon } from '../../src/components/common/Icon';
import { useAppStore } from '../../src/store/useAppStore';

interface ConsentItem {
  key: 'age' | 'terms' | 'privacy' | 'location' | 'marketing';
  label: string;
  required: boolean;
  detailRoute?: string;
}

const ITEMS: ConsentItem[] = [
  { key: 'age',       label: '만 14세 이상입니다',             required: true },
  { key: 'terms',     label: '서비스 이용약관 동의',           required: true,  detailRoute: '/(legal)/terms' },
  { key: 'privacy',   label: '개인정보 수집·이용 동의',        required: true,  detailRoute: '/(legal)/privacy-policy' },
  { key: 'location',  label: '위치기반서비스 이용약관 동의',    required: true,  detailRoute: '/(legal)/location-terms' },
  { key: 'marketing', label: '마케팅 정보 수신 동의',           required: false },
];

export default function ConsentScreen() {
  const router = useRouter();
  const setConsent = useAppStore(s => s.setConsent);

  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(ITEMS.map(it => [it.key, false])),
  );

  const allChecked = ITEMS.every(it => checks[it.key]);
  const requiredChecked = useMemo(
    () => ITEMS.filter(it => it.required).every(it => checks[it.key]),
    [checks],
  );

  const toggleAll = () => {
    const next = !allChecked;
    setChecks(Object.fromEntries(ITEMS.map(it => [it.key, next])));
  };
  const toggle = (key: string) => setChecks(prev => ({ ...prev, [key]: !prev[key] }));

  const onAgree = () => {
    if (!requiredChecked) {
      notify('필수 항목에 모두 동의해야 서비스를 이용할 수 있어요.', '필수 항목 동의');
      return;
    }
    setConsent({
      terms_of_service: checks.terms,
      privacy_policy:   checks.privacy,
      location_terms:   checks.location,
      marketing_optin:  checks.marketing,
      agreed_at:        new Date().toISOString(),
    });
    router.replace('/(auth)/dog-setup');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>약관 동의</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.lead}>
          DogEar 서비스를 이용하려면{'\n'}아래 항목에 동의가 필요해요.
        </Text>

        <TouchableOpacity style={s.allRow} onPress={toggleAll} activeOpacity={0.85}>
          <View style={[s.checkBox, allChecked && s.checkBoxOn]}>
            {allChecked && <Icon name="check" size={16} color="#FFFFFF" />}
          </View>
          <Text style={s.allLabel}>전체 동의 (선택 항목 포함)</Text>
        </TouchableOpacity>

        <View style={s.divider} />

        {ITEMS.map(item => (
          <View key={item.key} style={s.itemRow}>
            <TouchableOpacity
              style={s.itemTouch}
              onPress={() => toggle(item.key)}
              activeOpacity={0.7}
            >
              <View style={[s.checkBoxSm, checks[item.key] && s.checkBoxOn]}>
                {checks[item.key] && <Icon name="check" size={14} color="#FFFFFF" />}
              </View>
              <Text style={s.itemLabel}>
                <Text style={item.required ? s.required : s.optional}>
                  [{item.required ? '필수' : '선택'}]
                </Text>{' '}
                {item.label}
              </Text>
            </TouchableOpacity>
            {item.detailRoute && (
              <TouchableOpacity onPress={() => router.push(item.detailRoute as any)}>
                <Icon name="forward" size={16} color={Colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        <Text style={s.note}>
          마케팅 수신에 동의하지 않아도 서비스 이용에는 영향이 없어요.
        </Text>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, !requiredChecked && s.ctaDisabled]}
          onPress={onAgree}
          disabled={!requiredChecked}
          activeOpacity={0.88}
        >
          <Text style={s.ctaLabel}>동의하고 시작하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: 40 },

  header: {
    height: Layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  lead: { ...Typography.title.l, color: Colors.text.primary, marginBottom: Spacing[24] },

  allRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[12],
    backgroundColor: Colors.surface.subtle,
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[14],
    borderRadius: Radius.round, marginBottom: Spacing[12],
  },
  allLabel: { ...Typography.title.s, color: Colors.text.primary },

  divider: { height: 1, backgroundColor: Colors.border.subtle, marginVertical: Spacing[8] },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing[12],
  },
  itemTouch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[12] },
  itemLabel: { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  required: { color: Colors.brand.primary, fontWeight: '700' },
  optional: { color: Colors.text.tertiary, fontWeight: '600' },

  checkBox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border.strong,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkBoxSm: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border.strong,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkBoxOn: { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },

  note: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[20], lineHeight: 18 },

  footer: {
    paddingHorizontal: Spacing[20], paddingVertical: Spacing[16],
    borderTopWidth: 1, borderTopColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
  },
  cta: {
    height: 54, borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: Colors.border.strong },
  ctaLabel: { ...Typography.title.m, color: '#FFFFFF' },
});
