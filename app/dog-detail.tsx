/**
 * 강아지 상세 프로필 (내 강아지 전용)
 *
 * 진입: 내 정보 캐러셀에서 내 강아지 탭 → setActiveDog 후 이 화면
 * 구성: 프로필 헤더(✎ 편집) + 활동 요약 + 세그먼트 탭(발도장/저장/방문)
 * 데이터: store(활성 강아지 기준 checkins/savedSpots/visitSummaries) 재사용
 *   → DEV_SEED 데모·실서버 모두 동작. 타인 강아지는 적용 안 함(현행 유지).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { SAFETY_CONDITION_TEXTS } from '../src/config/familiar-layer';
import { useInteractedSpots } from '../src/hooks/useInteractedSpots';
import { Icon } from '../src/components/common/Icon';
import { AppImage } from '../src/components/common/AppImage';
import { ListSpotCard } from '../src/components/spot/SpotCard';
import { categoryLabel } from '../src/utils/labels';
import { sizeLabel } from '../src/utils/labels';
import type { Spot } from '../src/types';

type TabKey = 'paw' | 'saved' | 'visit';

export default function DogDetailScreen() {
  const router = useRouter();
  const dog          = useAppStore(s => s.activeDog);
  const checkins     = useAppStore(s => s.checkins);
  const privacySettingsByDog = useAppStore(s => s.privacySettingsByDog);
  const updatePrivacySetting = useAppStore(s => s.updatePrivacySetting);
  const savedSpots   = useAppStore(s => s.savedSpots);
  const visits       = useAppStore(s => s.visitSummaries);

  const [tab, setTab] = useState<TabKey>('paw');

  const isSaved = (spotId: string) => savedSpots.some(sv => sv.spot_id === spotId);

  // 발도장 남긴 "곳" = 발도장의 unique spot + 곳별 횟수
  const pawCountBySpot = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of checkins) m[c.spot_id] = (m[c.spot_id] ?? 0) + 1;
    return m;
  }, [checkins]);
  const pawSpotIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const c of checkins) { if (!seen.has(c.spot_id)) { seen.add(c.spot_id); ids.push(c.spot_id); } }
    return ids;
  }, [checkins]);
  const visitCountBySpot = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of visits) m[v.spot_id] = v.visit_count;
    return m;
  }, [visits]);

  // 상호작용한 모든 장소(발도장/저장/방문)의 Spot 정보 — 주변 여부와 무관하게 조회
  const allSpotIds = useMemo(
    () => Array.from(new Set([
      ...pawSpotIds,
      ...savedSpots.map(sv => sv.spot_id),
      ...visits.map(v => v.spot_id),
    ])),
    [pawSpotIds, savedSpots, visits],
  );
  const spotMap = useInteractedSpots(allSpotIds);
  const spotOf = (spotId: string): Spot | undefined => spotMap[spotId];

  if (!dog) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
            <Icon name="back" size={22} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={s.empty}><Text style={s.emptyText}>강아지 정보를 불러오지 못했어요.{'\n'}잠시 후 다시 열어주세요.</Text></View>
      </SafeAreaView>
    );
  }

  // 이 아이의 공개 설정. 서버에서 못 받았으면 섹션을 그리지 않는다
  const setting = privacySettingsByDog[dog.dog_id];

  const counts = { paw: pawSpotIds.length, saved: savedSpots.length, visit: visits.length };
  const rawListIds =
    tab === 'paw'   ? pawSpotIds :
    tab === 'saved' ? savedSpots.map(sv => sv.spot_id) :
                      visits.map(v => v.spot_id);
  // 실제 Spot 정보가 확보된 것만 렌더 — 미해결 장소로 인한 "빈 화면(안내 없음)" 방지
  const listIds = rawListIds.filter(id => spotMap[id]);
  // 아직 조회 중(해결 대기)인 항목이 남았는지 — 빈 안내를 섣불리 띄우지 않기 위함
  const isResolving = rawListIds.length > 0 && listIds.length === 0 &&
    rawListIds.some(id => !spotMap[id]);
  // 빈 상태는 사실 + 다음 행동 두 줄로 준다(§4.7)
  const emptyText =
    tab === 'paw'   ? '아직 발도장을 남긴 곳이 없어요.\n산책하며 발도장을 남기면 여기에 쌓여요.' :
    tab === 'saved' ? '아직 저장한 곳이 없어요.\n가보고 싶은 곳을 저장해두세요.' :
                      '아직 방문한 곳이 없어요.\n다녀온 장소가 여기에 기록돼요.';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{dog.name}</Text>
        <TouchableOpacity onPress={() => router.push('/dog-edit')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="프로필 편집">
          <Icon name="edit" size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* 프로필 헤더 */}
        <View style={s.profile}>
          {dog.avatar_url ? (
            <View style={s.avatar}>
              <AppImage source={{ uri: dog.avatar_url }} style={{ width: 72, height: 72 }} resizeMode="cover" accessibilityLabel={`${dog.name} 사진`} />
            </View>
          ) : (
            // 사진 없으면 이름 첫 글자 (홈 아바타와 동일한 일관성)
            <View style={[s.avatar, s.avatarPlaceholder]}>
              <Text style={s.avatarInitial}>{dog.name[0]}</Text>
            </View>
          )}
          <Text style={s.name}>{dog.name}</Text>
          <Text style={s.meta}>
            {[dog.breed, sizeLabel[dog.size]].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* ── 공개 설정 ──
            공개 설정은 **강아지 단위**다. 마이페이지 카드에는 요약만 띄우고
            실제 변경은 여기서 한다 — 카드는 전체가 탭 영역이라 안에 컨트롤을 넣으면
            터치가 서로 먹는다. */}
        {setting && (
          <View style={s.privacy}>
            <View style={s.privacyHead}>
              <Icon name="lock" size={12} color={Colors.text.tertiary} />
              <Text style={s.privacyTitle}>공개 설정</Text>
            </View>

            <View style={s.privacyRow}>
              <View style={s.privacyLabelWrap}>
                <Text style={s.privacyLabel}>우리 아이 프로필 공개</Text>
                <Text style={s.privacySub}>
                  {setting.allow_familiar_layer_exposure
                    ? '같은 장소를 자주 찾는 강아지에게 우리 아이가 소개돼요'
                    : '프로필 없이 기록만 남아요. 장소 분위기에는 보태집니다'}
                </Text>
              </View>
              <Switch
                value={setting.allow_familiar_layer_exposure}
                onValueChange={v => {
                  void updatePrivacySetting({ allow_familiar_layer_exposure: v }, dog.dog_id);
                }}
                trackColor={{ false: Colors.border.default, true: Colors.brand.primaryLight }}
                thumbColor={setting.allow_familiar_layer_exposure ? Colors.brand.primary : Colors.bg.secondary}
              />
            </View>

            {/* 켰을 때만 조건을 편다.
                꺼져 있으면 아무 데도 안 보이므로 조건은 읽을 이유가 없다.
                예전엔 이 자리에 '어떤 조건에서 보이나요? ›' 링크가 있었는데,
                들어가면 **같은 토글이 또 있는** 화면이라 중복이었다. 조건만 여기로 옮겼다. */}
            {setting.allow_familiar_layer_exposure && (
              <>
                <View style={s.privacySep} />
                <View style={s.conditions}>
                  <Text style={s.conditionsTitle}>
                    아래 조건을 모두 충족했을 때만 보여요
                  </Text>
                  {SAFETY_CONDITION_TEXTS.map((cond, i) => (
                    <View key={i} style={s.conditionRow}>
                      <View style={s.conditionDot} />
                      <Text style={s.conditionText}>{cond}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* ── 활동 요약 = 세그먼트 탭 ──
            숫자 블록이 이미 탭을 바꾸고 있었는데 아래에 탭 줄이 또 있었다.
            같은 일을 하는 컨트롤이 둘이라 어느 쪽을 눌러야 하는지 흐렸다.
            숫자가 곧 탭이다 — 활성 칸만 흰 알약으로 떠오른다. */}
        <View style={s.summary}>
          {([['paw','발도장'],['saved','저장'],['visit','방문']] as [TabKey,string][]).map(([k,label]) => {
            const on = tab === k;
            return (
              <TouchableOpacity
                key={k}
                style={[s.summaryItem, on && s.summaryItemOn]}
                onPress={() => setTab(k)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${label} ${counts[k]}개`}
              >
                <Text style={[s.summaryNum, !on && s.summaryNumOff]}>{counts[k]}</Text>
                <Text style={[s.summaryLabel, on && s.summaryLabelOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 리스트 */}
        <View style={s.list}>
          {listIds.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>{isResolving ? '불러오는 중…' : emptyText}</Text>
            </View>
          ) : (
            listIds.map(spotId => {
              const spot = spotOf(spotId);
              if (!spot) return null;
              return (
                <ListSpotCard
                  key={spotId}
                  name={spot.name}
                  categoryLabel={categoryLabel[spot.category]}
                  subcategory={spot.subcategory}
                  coverImageUrl={spot.cover_image_url}
                  distanceText={
                    tab === 'paw'   ? `발도장 ${pawCountBySpot[spotId] ?? 0}회` :
                    tab === 'visit' ? `방문 ${visitCountBySpot[spotId] ?? 0}회` : ''
                  }
                  isSaved={isSaved(spotId)}
                  onPress={() => router.push(`/spot/${spotId}`)}
                />
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[16], height: 52,
  },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary, marginHorizontal: Spacing[8] },
  content: { paddingBottom: Spacing[40] },

  profile: { alignItems: 'center', paddingVertical: Spacing[16] },
  avatar: {
    width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
    backgroundColor: Colors.bg.secondary, marginBottom: Spacing[12],
  },
  avatarPlaceholder: {
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: Colors.brand.accent },
  name: { ...Typography.title.m, color: Colors.text.primary },
  meta: { ...Typography.body.s, color: Colors.text.secondary, marginTop: Spacing[4] },

  // 숫자 블록이 곧 세그먼트 탭이다(별도 칩 줄 없음).
  // 트랙(회색) 위에서 활성 칸만 흰 알약으로 떠오른다 — iOS 세그먼트 컨트롤 관례.
  summary: {
    flexDirection: 'row',
    marginHorizontal: Spacing[16], marginBottom: Spacing[16],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.m,
    padding: Spacing[4],
    gap: Spacing[4],
  },
  summaryItem: {
    flex: 1, alignItems: 'center',
    paddingVertical: Spacing[10],
    borderRadius: Radius.m - 4,
  },
  summaryItemOn: {
    backgroundColor: Colors.surface.default,
    // 알약이 트랙에서 떠 보이게. 안드로이드는 elevation을 따로 준다.
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  summaryNum: { ...Typography.title.m, color: Colors.brand.primary },
  // 비활성은 숫자까지 눌러둔다 — 셋 다 주황이면 어느 게 열려 있는지 안 보인다
  summaryNumOff: { color: Colors.text.tertiary },
  // ── 공개 설정 ───────────────────────────────────────────
  // ⚠️ 바로 위 '활동 요약'(bg.secondary, 테두리 없음)보다 조용해야 한다.
  //    처음엔 옅은 주황 배경 + 주황 테두리로 만들었는데, 활동을 보러 들어온
  //    화면에서 설정이 가장 눈에 띄어 위계가 뒤집혔다. 같은 층위로 맞춘다.
  privacy: {
    marginHorizontal: Spacing[16],
    marginBottom: Spacing[16],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.m,
    paddingHorizontal: Spacing[14],
  },
  privacyHead: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    paddingTop: Spacing[12], paddingBottom: Spacing[2],
  },
  privacyTitle: { ...Typography.label.s, color: Colors.text.tertiary, fontWeight: '600' },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[10],
    paddingVertical: Spacing[12], minHeight: 48,
  },
  privacyLabelWrap: { flex: 1, gap: 1 },
  privacyLabel: { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  privacySub: { ...Typography.caption, color: Colors.text.tertiary, lineHeight: 15 },
  privacySep: { height: 1, backgroundColor: Colors.border.default },

  // 안전 조건 — 토글이 켜졌을 때만 편다
  conditions: { paddingVertical: Spacing[12], gap: Spacing[8] },
  conditionsTitle: { ...Typography.label.m, color: Colors.text.secondary, fontWeight: '600' },
  conditionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[8] },
  conditionDot: {
    width: 4, height: 4, borderRadius: 2, marginTop: 7,
    backgroundColor: Colors.brand.primary,
  },
  conditionText: { flex: 1, ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },

  summaryLabel: { ...Typography.label.s, color: Colors.text.secondary, marginTop: Spacing[2], letterSpacing: 0 },
  summaryLabelOn: { color: Colors.text.primary, fontWeight: '600' },


  list: { paddingHorizontal: Spacing[16], gap: Spacing[10] },
  empty: { paddingVertical: Spacing[40], alignItems: 'center' },
  emptyText: { ...Typography.body.s, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
});
