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
import { useInteractedSpots } from '../src/hooks/useInteractedSpots';
import { Icon } from '../src/components/common/Icon';
import { AppImage } from '../src/components/common/AppImage';
import { ListSpotCard } from '../src/components/spot/SpotCard';
import { categoryLabel } from '../src/utils/labels';
import { sizeLabel, visibilityLabel } from '../src/utils/labels';
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

        {/* 활동 요약 */}
        <View style={s.summary}>
          {([['paw','발도장'],['saved','저장'],['visit','방문']] as [TabKey,string][]).map(([k,label]) => (
            <TouchableOpacity key={k} style={s.summaryItem} onPress={() => setTab(k)} activeOpacity={0.7}>
              <Text style={s.summaryNum}>{counts[k]}</Text>
              <Text style={s.summaryLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── 공개 설정 ──
            공개 설정은 **강아지 단위**다. 마이페이지 카드에는 요약만 띄우고
            실제 변경은 여기서 한다 — 카드는 전체가 탭 영역이라 안에 컨트롤을 넣으면
            터치가 서로 먹는다. */}
        {setting && (
          <View style={s.privacy}>
            <View style={s.privacyHead}>
              <Icon name="lock" size={14} color={Colors.brand.primary} />
              <Text style={s.privacyTitle}>공개 설정</Text>
            </View>

            <TouchableOpacity
              style={s.privacyRow}
              onPress={() => router.push('/privacy-settings')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`발도장 공개 범위, 현재 ${visibilityLabel[setting.default_visibility_level]}`}
            >
              <Text style={s.privacyLabel}>발도장 공개 범위</Text>
              <Text style={s.privacyValue}>{visibilityLabel[setting.default_visibility_level]}</Text>
              <Icon name="forward" size={15} color={Colors.text.tertiary} />
            </TouchableOpacity>

            <View style={s.privacySep} />

            <View style={s.privacyRow}>
              <View style={s.privacyLabelWrap}>
                <Text style={s.privacyLabel}>산책 친구 찾기에 보이기</Text>
                <Text style={s.privacySub}>안전 조건 6가지를 모두 충족했을 때만 보여요</Text>
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
          </View>
        )}

        {/* 세그먼트 탭 */}
        <View style={s.tabs}>
          {([['paw','발도장'],['saved','저장한 곳'],['visit','방문한 곳']] as [TabKey,string][]).map(([k,label]) => (
            <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabActive]} onPress={() => setTab(k)} activeOpacity={0.8}>
              <Text style={[s.tabText, tab === k && s.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
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

  summary: {
    flexDirection: 'row',
    marginHorizontal: Spacing[16], marginBottom: Spacing[16],
    backgroundColor: Colors.bg.secondary, borderRadius: Radius.m, paddingVertical: Spacing[14],
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { ...Typography.title.m, color: Colors.brand.primary },
  // ── 공개 설정 ───────────────────────────────────────────
  privacy: {
    marginHorizontal: Spacing[16],
    marginTop: Spacing[16],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.brand.primaryLight,
    paddingHorizontal: Spacing[16],
  },
  privacyHead: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    paddingTop: Spacing[14], paddingBottom: Spacing[6],
  },
  privacyTitle: { ...Typography.label.m, color: Colors.text.secondary, fontWeight: '700' },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[10],
    paddingVertical: Spacing[12], minHeight: 52,
  },
  privacyLabelWrap: { flex: 1, gap: 2 },
  privacyLabel: { flex: 1, ...Typography.body.m, color: Colors.text.primary },
  privacyValue: { ...Typography.body.s, color: Colors.brand.primary, fontWeight: '700' },
  privacySub: { ...Typography.caption, color: Colors.text.tertiary, lineHeight: 16 },
  // 배경이 옅어 border.default는 안 보인다
  privacySep: { height: 1, backgroundColor: 'rgba(255,122,48,0.16)' },

  summaryLabel: { ...Typography.label.s, color: Colors.text.secondary, marginTop: Spacing[2], letterSpacing: 0 },

  tabs: {
    flexDirection: 'row', gap: Spacing[8],
    paddingHorizontal: Spacing[16], marginBottom: Spacing[12],
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing[10],
    borderRadius: Radius.round, backgroundColor: Colors.bg.secondary,
  },
  tabActive: { backgroundColor: Colors.brand.primary },
  tabText: { ...Typography.label.m, color: Colors.text.secondary },
  tabTextActive: { color: Colors.text.inverse, fontWeight: '600' },

  list: { paddingHorizontal: Spacing[16], gap: Spacing[10] },
  empty: { paddingVertical: Spacing[40], alignItems: 'center' },
  emptyText: { ...Typography.body.s, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
});
