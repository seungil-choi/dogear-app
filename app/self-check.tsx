/**
 * 자가진단 — 기기에서 직접 돌리는 점검 화면
 *
 * 왜 필요한가:
 *   개발 PC에서는 실기기 상태를 볼 수 없다. 그래서 "튕긴다 / 지도가 느리다 /
 *   핀이 안 뜬다 / 테스트 강아지가 보인다" 같은 보고를 추측으로만 좇았다.
 *   이 화면은 앱이 스스로 검사하고 결과를 보여준다. 캡처 한 장이면 원인 추적이 된다.
 *
 * 성격: 내부 점검용. 서버에 쓰기를 남기지 않는다(계측 검사만 이벤트 1건 기록).
 */

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { useAppStore } from '../src/store/useAppStore';
import { supabase } from '../src/lib/supabase';
import { IS_REAL_AUTH } from '../src/config/env';
import { mergeSpotList } from '../src/store/spotMerge';
import { parkIllustration } from '../src/constants/parkIllustrations';
import { categoryLabel } from '../src/utils/labels';
import type { Spot } from '../src/types';

type Status = 'pass' | 'fail' | 'warn';
interface Result { name: string; status: Status; detail: string; ms?: number }

const MOCK_DOG_NAMES = ['보리', '콩이', '아몬드'];

export default function SelfCheckScreen() {
  const router = useRouter();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const out: Result[] = [];
    const push = (r: Result) => { out.push(r); setResults([...out]); };
    const timed = async <T,>(fn: () => Promise<T>): Promise<[T | null, number, any]> => {
      const t0 = Date.now();
      try { return [await fn(), Date.now() - t0, null]; }
      catch (e) { return [null, Date.now() - t0, e]; }
    };

    // 1. 환경
    push({
      name: '실행 모드',
      status: IS_REAL_AUTH ? 'pass' : 'warn',
      detail: IS_REAL_AUTH ? '실환경(실 서버·실 인증)' : '데모 모드 — 서버를 쓰지 않습니다',
    });

    // 2. 세션 + ID 공간 (계측이 죽었던 원인)
    const [sess, sessMs] = await timed(() => supabase.auth.getUser());
    const authId = (sess as any)?.data?.user?.id ?? null;
    const storeUser = useAppStore.getState().user;
    push({
      name: '로그인 세션',
      status: authId ? 'pass' : 'fail',
      detail: authId ? `auth 사용자 확인됨` : '세션 없음 — 로그인 필요',
      ms: sessMs,
    });
    if (authId && storeUser) {
      const ok = storeUser.auth_id === authId;
      push({
        name: 'ID 공간 일치 (계측 전제)',
        status: ok ? 'pass' : 'fail',
        detail: ok
          ? 'User.auth_id 가 auth.uid() 와 일치'
          : 'auth_id 불일치 — 이벤트가 RLS에서 거부됩니다',
      });
    }

    // 3. 계측 적재 — 실제로 1건 넣어보고 성공 여부 확인
    if (IS_REAL_AUTH && authId) {
      const [, evMs, evErr] = await timed(async () => {
        const { error } = await supabase.from('events').insert({
          event_name: 'self_check_ping',
          occurred_at: new Date().toISOString(),
          user_id: authId,
          session_id: 'self-check',
          screen_name: 'self_check',
          properties: {},
        });
        if (error) throw error;
        return true;
      });
      push({
        name: '계측 적재',
        status: evErr ? 'fail' : 'pass',
        detail: evErr ? `거부됨: ${String((evErr as any)?.message ?? evErr).slice(0, 90)}` : '이벤트 기록 성공',
        ms: evMs,
      });
    }

    // 4. 위치
    if (Platform.OS !== 'web') {
      const [perm, permMs] = await timed(() => Location.getForegroundPermissionsAsync());
      const granted = (perm as any)?.status === 'granted';
      const loc = useAppStore.getState().currentLocation;
      push({
        name: '위치 권한',
        status: granted ? 'pass' : 'warn',
        detail: granted
          ? (loc ? `좌표 확보 (${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})` : '권한 있으나 좌표 미확보')
          : '권한 없음 — 기본 위치로 동작합니다',
        ms: permMs,
      });
    }

    // 5. 장소 조회 (지도 느림·핀 없음 진단)
    if (IS_REAL_AUTH) {
      const center = useAppStore.getState().currentLocation ?? { latitude: 37.5563, longitude: 126.9237 };
      const [res, ms, err] = await timed(async () => {
        const { data, error } = await supabase.functions.invoke('spots-nearby', {
          body: { latitude: center.latitude, longitude: center.longitude, radiusMeters: 3000, dogId: null },
        });
        if (error) throw error;
        return (data?.spots ?? []) as any[];
      });
      const n = res?.length ?? 0;
      push({
        name: '주변 장소 조회',
        status: err ? 'fail' : (n > 0 ? 'pass' : 'warn'),
        detail: err ? `실패: ${String((err as any)?.message ?? err).slice(0, 90)}`
                    : `${n}곳 응답${n === 0 ? ' — 이 지역에 데이터가 없습니다' : ''}`,
        ms,
      });
      if (n > 0) {
        const withSub = res!.filter((s: any) => s.subcategory != null).length;
        push({
          name: '썸네일 근거(subcategory)',
          status: 'pass',
          detail: `${withSub}/${n}곳에 공원구분 있음 (없어도 카테고리 일러스트로 폴백)`,
        });
      }
    }

    // 6. 스토어 상태 — 목 데이터 잔존(테스트 강아지) 확인
    const st = useAppStore.getState();
    const mockDogs = st.dogs.filter(d => MOCK_DOG_NAMES.includes(d.name));
    push({
      name: '목 데이터 잔존',
      status: mockDogs.length > 0 ? 'fail' : 'pass',
      detail: mockDogs.length > 0
        ? `테스트 강아지 ${mockDogs.map(d => d.name).join(', ')} — 이전 저장본이 남았습니다`
        : '없음',
    });
    push({
      name: '메모리 상태',
      status: st.spots.length > 600 ? 'fail' : 'pass',
      detail: `장소 ${st.spots.length}개 / 강아지 ${st.dogs.length}마리 / 발도장 ${st.checkins.length}건`,
    });

    // 7. 핵심 규칙 자가검증 (유닛 테스트와 동일 규칙을 기기에서 재확인)
    const s = (id: string, e: Partial<Spot> = {}): Spot => ({
      spot_id: id, name: id, category: 'park', latitude: 37.5, longitude: 127,
      status: 'active', created_source: 'seed', created_at: '', ...e,
    });
    const merged = mergeSpotList(
      [s('a', { subcategory: '어린이공원' })],
      [s('a', { name: 'a2' })],
      { savedSpotIds: [], visitedSpotIds: [], selectedSpotId: null },
    );
    push({
      name: '병합 규칙 (subcategory 보존)',
      status: merged[0]?.subcategory === '어린이공원' ? 'pass' : 'fail',
      detail: merged[0]?.subcategory === '어린이공원' ? '정상' : '유실 — 썸네일이 어긋납니다',
    });
    // 유형 목록을 손으로 적으면 enum이 늘 때마다 어긋난다(실제로 4개만 검사하면서
    // '모든 카테고리 커버'라고 말하고 있었다). 런타임 목록에서 파생시킨다.
    const allCats = [...Object.keys(categoryLabel), null];
    const illoMissing = allCats.filter(c => !parkIllustration(null, c as any));
    push({
      name: '일러스트 폴백',
      status: illoMissing.length === 0 ? 'pass' : 'fail',
      detail: illoMissing.length === 0
        ? `${allCats.length - 1}개 유형 전부 커버`
        : `빠짐: ${illoMissing.join(', ')}`,
    });

    setRunning(false);
  }, []);

  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc as any)[r.status] + 1 }),
    { pass: 0, fail: 0, warn: 0 } as Record<Status, number>,
  );

  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>자가진단</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.content}>
        <Text style={st.desc}>
          앱이 스스로 서버·인증·계측·데이터 상태를 점검합니다.
          문제가 보이면 이 화면을 캡처해서 보내주세요.
        </Text>

        <TouchableOpacity
          style={[st.runBtn, running && st.runBtnDisabled]}
          onPress={run}
          disabled={running}
          activeOpacity={0.85}
        >
          <Text style={st.runBtnText}>{running ? '검사 중…' : '검사 실행'}</Text>
        </TouchableOpacity>

        {results.length > 0 && (
          <View style={st.summary}>
            <Text style={st.summaryText}>
              통과 {counts.pass} · 주의 {counts.warn} · 실패 {counts.fail}
            </Text>
          </View>
        )}

        {results.map((r, i) => (
          <View key={i} style={st.row}>
            <View style={[st.dot, r.status === 'pass' ? st.dotPass : r.status === 'warn' ? st.dotWarn : st.dotFail]} />
            <View style={{ flex: 1 }}>
              <Text style={st.rowName}>
                {r.name}{r.ms != null ? `  ${r.ms}ms` : ''}
              </Text>
              <Text style={st.rowDetail}>{r.detail}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },
  content: { padding: Spacing[20] },
  desc: { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20, marginBottom: Spacing[16] },
  runBtn: {
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.round,
    paddingVertical: Spacing[14],
    alignItems: 'center',
  },
  runBtnDisabled: { opacity: 0.6 },
  runBtnText: { ...Typography.label.l, color: Colors.brand.onPrimary, fontWeight: '700' },
  summary: {
    marginTop: Spacing[16], paddingVertical: Spacing[10],
    borderRadius: Radius.m, backgroundColor: Colors.bg.secondary, alignItems: 'center',
  },
  summaryText: { ...Typography.label.m, color: Colors.text.primary, fontWeight: '700' },
  row: {
    flexDirection: 'row', gap: Spacing[10],
    paddingVertical: Spacing[12],
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotPass: { backgroundColor: Colors.status.success.text },
  dotWarn: { backgroundColor: Colors.status.warning.text },
  dotFail: { backgroundColor: Colors.status.error.text },
  rowName: { ...Typography.label.m, color: Colors.text.primary, fontWeight: '600' },
  rowDetail: { ...Typography.body.s, color: Colors.text.secondary, marginTop: 2, lineHeight: 18 },
});
