/**
 * Icon Showcase — 모든 시맨틱 아이콘을 한눈에 보는 디버그/검수 화면
 *
 * 사용법:
 *   import { IconShowcase } from './icon-pack/Showcase';
 *   ...
 *   <IconShowcase />
 *
 * 또는 라우트 등록:
 *   app/icon-showcase.tsx 에 export default IconShowcase
 */

import React from 'react';
import { ScrollView, View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { ALL_ICON_NAMES, Icon, type IconName } from './Icon';

const SIZES = [16, 20, 24, 32];

export function IconShowcase({
  textColor = '#1A1A1A',
  iconColor = '#1A1A1A',
  bg = '#FFFFFF',
  cardBg = '#F7F7F7',
}: {
  textColor?: string;
  iconColor?: string;
  bg?: string;
  cardBg?: string;
}) {
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={[s.title, { color: textColor }]}>Icon Showcase</Text>
        <Text style={[s.subtitle, { color: textColor, opacity: 0.6 }]}>
          {ALL_ICON_NAMES.length}개 시맨틱 이름 · 4개 사이즈 자동 stroke 가중
        </Text>

        <View style={s.grid}>
          {ALL_ICON_NAMES.map((name) => (
            <Card
              key={name}
              name={name}
              iconColor={iconColor}
              textColor={textColor}
              bg={cardBg}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  name,
  iconColor,
  textColor,
  bg,
}: {
  name: IconName;
  iconColor: string;
  textColor: string;
  bg: string;
}) {
  return (
    <View style={[s.card, { backgroundColor: bg }]}>
      <View style={s.row}>
        {SIZES.map((size) => (
          <View key={size} style={s.cell}>
            <Icon name={name} size={size} color={iconColor} />
            <Text style={[s.sizeLabel, { color: textColor, opacity: 0.5 }]}>
              {size}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[s.name, { color: textColor }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 12, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    width: 168,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 4, width: 32 },
  sizeLabel: { fontSize: 9 },
  name: { fontSize: 11, fontWeight: '600' },
});

export default IconShowcase;
