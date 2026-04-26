/**
 * 법적 문서/정책 텍스트 화면 공용 컴포넌트
 * 이용약관, 개인정보 처리방침, 위치기반서비스 이용약관 등에서 사용
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Layout } from '../../constants/tokens';
import { Icon } from './Icon';

export interface LegalSection {
  title: string;
  body: string;
}

interface Props {
  title: string;
  effectiveDate: string;
  intro?: string;
  sections: LegalSection[];
}

export function LegalScreen({ title, effectiveDate, intro, sections }: Props) {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="뒤로 가기"
        >
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.effective}>시행일: {effectiveDate}</Text>
        {intro ? <Text style={s.intro}>{intro}</Text> : null}

        {sections.map((sec, idx) => (
          <View key={idx} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:  { flex: 1 },
  content: { padding: Spacing[16], paddingBottom: 40 },

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
  headerTitle: {
    flex: 1, textAlign: 'center',
    ...Typography.title.m, color: Colors.text.primary,
  },

  effective: { ...Typography.label.s, color: Colors.text.tertiary, marginBottom: Spacing[8] },
  intro: { ...Typography.body.m, color: Colors.text.secondary, marginBottom: Spacing[20] },

  section: { marginBottom: Spacing[24] },
  sectionTitle: {
    ...Typography.title.s, color: Colors.text.primary,
    marginBottom: Spacing[8],
  },
  sectionBody: {
    ...Typography.body.m, color: Colors.text.secondary,
  },
});
