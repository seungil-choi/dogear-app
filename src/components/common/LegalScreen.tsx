/**
 * 법적 문서/정책 텍스트 화면 공용 컴포넌트
 * 이용약관, 개인정보 처리방침, 위치기반서비스 이용약관 등에서 사용
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Layout } from '../../constants/tokens';
import { Icon } from './Icon';

export interface LegalSection {
  title: string;
  body: string;
}

/**
 * 개정본을 시행일 전에 미리 싣는 경우의 안내.
 * 시행일 전에는 "시행 예정" 띠를 보여주고 현행본(웹)으로 가는 길을 둔다.
 * 시행일이 지나면 띠는 사라지고 맨 아래 "이전 버전 보기"만 남는다.
 */
export interface LegalRevision {
  /** 시행 시각(ISO, KST 자정) */
  effectiveAt: string;
  /** 이전 버전의 시행일 표기 — 예: '2026.09.22' */
  previousDate: string;
  /** 이전 버전 전문(웹) */
  previousUrl: string;
}

interface Props {
  title: string;
  effectiveDate: string;
  intro?: string;
  sections: LegalSection[];
  revision?: LegalRevision;
}

export function LegalScreen({ title, effectiveDate, intro, sections, revision }: Props) {
  const router = useRouter();
  const upcoming = revision ? Date.now() < Date.parse(revision.effectiveAt) : false;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
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
        {revision && upcoming ? (
          <TouchableOpacity
            style={s.banner}
            onPress={() => { void Linking.openURL(revision.previousUrl); }}
            activeOpacity={0.85}
            accessibilityRole="link"
          >
            <Text style={s.bannerText}>
              개정된 내용으로 {effectiveDate}부터 시행됩니다. 그 전까지는 {revision.previousDate} 시행본이 적용됩니다.
            </Text>
            <Text style={s.bannerLink}>현행 전문 보기</Text>
          </TouchableOpacity>
        ) : null}
        {intro ? <Text style={s.intro}>{intro}</Text> : null}

        {sections.map((sec, idx) => (
          <View key={idx} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        {revision && !upcoming ? (
          <TouchableOpacity onPress={() => { void Linking.openURL(revision.previousUrl); }} accessibilityRole="link">
            <Text style={s.bannerLink}>이전 버전({revision.previousDate} 시행) 보기</Text>
          </TouchableOpacity>
        ) : null}
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
  banner: {
    backgroundColor: Colors.bg.secondary, borderRadius: 12,
    padding: Spacing[12], marginBottom: Spacing[20], gap: Spacing[6],
  },
  bannerText: { ...Typography.body.s, color: Colors.text.primary },
  bannerLink: { ...Typography.label.m, color: Colors.brand.primary },

  section: { marginBottom: Spacing[24] },
  sectionTitle: {
    ...Typography.title.s, color: Colors.text.primary,
    marginBottom: Spacing[8],
  },
  sectionBody: {
    ...Typography.body.m, color: Colors.text.secondary,
  },
});
