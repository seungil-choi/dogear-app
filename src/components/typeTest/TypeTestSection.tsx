/**
 * 마이페이지 「유형 테스트」 섹션 (planning/34 1장)
 *
 * 강아지 캐러셀 바로 아래. 원형 썸네일을 가로로 스크롤한다 — 테스트 2개 + 「준비중」 1개.
 * 캐러셀에서 강아지를 넘기면(activeDog) 그 강아지의 결과로 바뀐다.
 * 한 테스트는 결과 이름과 결과 그림을 보여주고, 누르면 결과 보기/다시 하기를 고른다.
 * 화면에 돌아올 때마다(테스트를 마치고 돌아온 경우 포함) 결과를 다시 읽는다.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppImage } from '../common/AppImage';
import { Icon } from '../common/Icon';
import { Colors, Typography, Spacing } from '../../constants/tokens';
import { toast } from '../../utils/toast';
import { actionSheet } from '../../utils/dialog';
import { IS_REAL_AUTH } from '../../config/env';
import type { Dog } from '../../types';
import { loadTypeTests, fetchLatestResults, resultName, type TypeTest, type DogTypeResult } from '../../lib/typeTests';

const CIRCLE = 64;

/** dog가 없으면(강아지 미등록) 썸네일을 누를 때 등록 화면으로 먼저 보낸다 */
export function TypeTestSection({ dog }: { dog: Dog | null }) {
  const router = useRouter();
  const [tests, setTests] = useState<TypeTest[] | null>(null);
  const [results, setResults] = useState<Record<string, DogTypeResult>>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      const list = await loadTypeTests(force);
      setTests(list);
      setFailed(false);
      if (IS_REAL_AUTH && dog) {
        const all = await fetchLatestResults([dog.dog_id]);
        setResults(all[dog.dog_id] ?? {});
      } else {
        setResults({});
      }
    } catch (e: any) {
      console.error('[type-test] 목록·결과 로드 실패:', e?.message ?? e);
      setFailed(true);
    }
  }, [dog?.dog_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (t: TypeTest) => {
    if (t.status !== 'live') {
      toast.info('다음 테스트를 준비하고 있어요');
      return;
    }
    if (!dog) {
      toast.info('결과를 남길 강아지를 먼저 등록해 주세요');
      router.push('/(auth)/dog-setup' as any);
      return;
    }
    const done = results[t.key];
    if (!done) {
      router.push({ pathname: '/type-test', params: { test: t.key, dogId: dog.dog_id } } as any);
      return;
    }
    const idx = await actionSheet(`${dog.name} · ${resultName(t, done.result_key)}`, [
      { label: '결과 보기' },
      { label: '다시 하기' },
    ]);
    if (idx === 0) router.push('/dog-detail' as any);
    if (idx === 1) router.push({ pathname: '/type-test', params: { test: t.key, dogId: dog.dog_id } } as any);
  };

  return (
    <View style={s.section}>
      <View style={s.head}>
        <View style={s.titleRow}>
          <Icon name="sparkles" size={15} color={Colors.text.secondary} />
          <Text style={s.title}>유형 테스트</Text>
        </View>
        <Text style={s.caption}>
          {dog ? `${dog.name}의 성향을 알아보고 프로필에 남겨요` : '강아지를 등록하면 결과를 프로필에 남길 수 있어요'}
        </Text>
      </View>

      {failed && !tests ? (
        <TouchableOpacity style={s.retry} onPress={() => load(true)} accessibilityRole="button">
          <Icon name="refresh" size={16} color={Colors.text.secondary} />
          <Text style={s.retryText}>테스트 목록을 불러오지 못했어요. 눌러서 다시 시도</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {(tests ?? [null, null, null]).map((t, i) => {
            if (!t) {
              return (
                <View key={`ph-${i}`} style={s.cell}>
                  <View style={[s.circle, s.placeholder]} />
                  <View style={s.phLine} />
                </View>
              );
            }
            const done = results[t.key];
            const img = done ? t.results?.[done.result_key]?.image ?? t.thumbnail : t.thumbnail;
            const soon = t.status !== 'live';
            return (
              <TouchableOpacity
                key={t.key}
                style={s.cell}
                activeOpacity={0.75}
                onPress={() => open(t)}
                accessibilityRole="button"
                accessibilityLabel={soon ? '준비중인 테스트' : done ? `${t.title} 결과 ${resultName(t, done.result_key)}` : `${t.title} 테스트 하기`}
              >
                <View style={s.circleWrap}>
                  {soon ? (
                    <View style={[s.circle, s.soon]}>
                      <Icon name="sparkles" size={22} color={Colors.text.tertiary} />
                    </View>
                  ) : (
                    <View style={[s.circle, done && s.circleDone]}>
                      <AppImage source={{ uri: img }} style={s.img} resizeMode="cover" decorative />
                    </View>
                  )}
                  {done && (
                    <View style={s.badge}>
                      <Icon name="check" size={11} color={Colors.text.inverse} />
                    </View>
                  )}
                </View>
                <Text style={s.label} numberOfLines={1}>{t.title}</Text>
                <Text style={[s.sub, done && s.subDone]} numberOfLines={1}>
                  {soon ? '준비중' : done ? resultName(t, done.result_key) : '해보기'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: Spacing[24], gap: Spacing[10] },
  // 마이페이지 다른 섹션(사진·설정) 제목과 같은 모양
  head: { marginHorizontal: Spacing[16], paddingHorizontal: Spacing[4], gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  title: { ...Typography.label.m, color: Colors.text.tertiary, fontWeight: '600', letterSpacing: 0.3 },
  caption: { ...Typography.caption, color: Colors.text.tertiary },
  rail: { paddingHorizontal: Spacing[16], gap: Spacing[14] },
  cell: { width: 76, alignItems: 'center' },
  circleWrap: { width: CIRCLE, height: CIRCLE },
  circle: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, overflow: 'hidden',
    backgroundColor: Colors.bg.tertiary, borderWidth: 1, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  circleDone: { borderWidth: 2, borderColor: Colors.brand.primary },
  img: { width: '100%', height: '100%' },
  soon: { borderStyle: 'dashed', borderColor: Colors.border.default, backgroundColor: Colors.bg.secondary },
  placeholder: { borderWidth: 0 },
  phLine: { marginTop: Spacing[8], width: 44, height: 10, borderRadius: 5, backgroundColor: Colors.bg.tertiary },
  badge: {
    position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.brand.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.bg.primary,
  },
  label: { ...Typography.label.s, color: Colors.text.primary, marginTop: Spacing[6] },
  sub: { ...Typography.caption, color: Colors.text.tertiary },
  subDone: { color: Colors.brand.primary, fontWeight: '700' },
  retry: {
    marginHorizontal: Spacing[16], flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    paddingVertical: Spacing[12],
  },
  retryText: { ...Typography.caption, color: Colors.text.secondary },
});
