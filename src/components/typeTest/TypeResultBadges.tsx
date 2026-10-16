/**
 * 유형 테스트 결과 — 원형 썸네일 + 배지 (planning/34 1장)
 *
 * 보호자가 고른 성향 태그와 섞지 않는 자리에 둔다(테스트 결과는 "테스트가 본 모습"이다).
 * 내 강아지 상세(dog-detail)와 다른 강아지 프로필 시트(장소 상세)가 함께 쓴다.
 * 결과가 하나도 없으면 아무것도 그리지 않는다.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppImage } from '../common/AppImage';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { loadTypeTests, fetchLatestResults, resultName, type TypeTest } from '../../lib/typeTests';
import { IS_REAL_AUTH } from '../../config/env';

export interface TypeResultItem { test_key: string; result_key: string }

export function TypeResultBadges({ items, title }: { items: TypeResultItem[]; title?: string }) {
  const [tests, setTests] = useState<TypeTest[] | null>(null);
  useEffect(() => { loadTypeTests().then(setTests).catch(() => setTests([])); }, []);
  if (!items.length) return null;

  return (
    <View style={s.wrap}>
      {title && <Text style={s.title}>{title}</Text>}
      <View style={s.row}>
        {items.map(it => {
          const t = tests?.find(x => x.key === it.test_key);
          const img = t?.results?.[it.result_key]?.image;
          return (
            <View key={it.test_key} style={s.item}>
              <View style={s.circle}>
                {img ? <AppImage source={{ uri: img }} style={s.img} resizeMode="cover" decorative /> : null}
              </View>
              <View style={s.textCol}>
                <Text style={s.testName} numberOfLines={1}>{t?.title ?? it.test_key}</Text>
                <View style={s.badge}>
                  <Text style={s.badgeText} numberOfLines={1}>{resultName(t, it.result_key)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** 내 강아지의 테스트별 최신 결과 */
export function useMyDogTypeResults(dogId: string | undefined): TypeResultItem[] {
  const [items, setItems] = useState<TypeResultItem[]>([]);
  useEffect(() => {
    if (!dogId || !IS_REAL_AUTH) { setItems([]); return; }
    let alive = true;
    fetchLatestResults([dogId])
      .then(all => {
        if (!alive) return;
        setItems(Object.values(all[dogId] ?? {}).map(r => ({ test_key: r.test_key, result_key: r.result_key })));
      })
      .catch(e => console.error('[type-test] 결과 로드 실패:', e?.message ?? e));
    return () => { alive = false; };
  }, [dogId]);
  return items;
}

const s = StyleSheet.create({
  wrap: { gap: Spacing[8] },
  title: { ...Typography.label.m, color: Colors.text.tertiary, fontWeight: '600', letterSpacing: 0.3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[10] },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[8],
    paddingVertical: Spacing[6], paddingLeft: Spacing[6], paddingRight: Spacing[12],
    borderRadius: Radius.round, backgroundColor: Colors.bg.secondary,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  circle: {
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    backgroundColor: Colors.bg.tertiary, borderWidth: 1.5, borderColor: Colors.brand.primary,
  },
  img: { width: '100%', height: '100%' },
  textCol: { gap: 2, maxWidth: 140 },
  testName: { ...Typography.caption, color: Colors.text.tertiary },
  badge: { alignSelf: 'flex-start' },
  badgeText: { ...Typography.label.m, color: Colors.brand.primary, fontWeight: '700' },
});
