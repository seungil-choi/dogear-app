import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Colors, Typography, Spacing } from '../src/constants/tokens';

export default function NotFoundScreen() {
  return (
    <View style={s.container}>
      <Text style={s.emoji}>🐾</Text>
      <Text style={s.title}>페이지를 찾을 수 없어요</Text>
      <Link href="/(tabs)" style={s.link}>
        <Text style={s.linkText}>홈으로 돌아가기</Text>
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[16], backgroundColor: Colors.bg.primary },
  emoji: { fontSize: 56 },
  title: { ...Typography.title.m, color: Colors.text.primary },
  link: {},
  linkText: { ...Typography.label.l, color: Colors.brand.primary },
});
