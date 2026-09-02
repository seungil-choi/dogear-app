/**
 * 사업자 정보 (공개) — 전자상거래/통신 표시 의무 + 카카오 비즈앱 심사 대응.
 * 사업자등록증명(2026.06.25)상의 내용과 동일. 민감정보(주민등록번호 등)는 비공개.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '../../src/constants/tokens';
import { Icon } from '../../src/components/common/Icon';

const ROWS: [string, string][] = [
  ['상호', '나인팩토리얼 (9Factorial)'],
  ['대표자', '최승일'],
  ['사업자등록번호', '210-44-30615'],
  ['사업장 소재지', '서울특별시 강북구 한천로143길 34-11, 101호 (수유동, 동아쉐르빌 23차)'],
  ['업태', '도매 및 소매업 · 정보통신업'],
  ['종목', '전자상거래 소매업, 교과서 및 학습 서적 출판업, 포털 및 기타 인터넷 정보 매개 서비스업'],
  ['이메일', 'support@9factorial.com'],
];

export default function BusinessInfoScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>사업자 정보</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>DogEar는 나인팩토리얼(9Factorial)이 운영합니다.</Text>
        {ROWS.map(([label, value]) => (
          <View key={label} style={s.row}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.value}>{value}</Text>
          </View>
        ))}
        <Text style={s.note}>
          본 정보는 사업자등록증명상의 내용과 동일합니다. 문의는 위 이메일로 접수해 주세요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: 40 },
  intro: { ...Typography.body.m, color: Colors.text.secondary, marginBottom: Spacing[20] },
  row: { paddingVertical: Spacing[12], borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  label: { ...Typography.label.m, color: Colors.text.tertiary, marginBottom: Spacing[4] },
  value: { ...Typography.body.m, color: Colors.text.primary, lineHeight: 22 },
  note: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[20], lineHeight: 18 },
});
