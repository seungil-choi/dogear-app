/**
 * 홈 탭
 *
 * 구성:
 *   - Dogear 로고 헤더 + 알림
 *   - 강아지 프로필 카드 (아바타·이름·품종·체중·태그)
 *   - 오늘의 추천 스팟 (대형 피처드 카드)
 *   - 최근 간 장소 (수평 레일)
 *   - 자주 가는 장소 (수평 레일)
 *   - 지도 탐색 버튼
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { track, EVENT } from '../../src/utils/analytics';
import { confirm } from '../../src/utils/dialog';
import { AppImage } from '../../src/components/common/AppImage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, RefreshControl, Dimensions, NativeScrollEvent, NativeSyntheticEvent, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
// 거리 계산은 geo.ts 한 곳만 쓴다 — 같은 공식을 화면마다 다시 구현하지 않는다
import { haversineDistance } from '../../src/utils/geo';
import { RecentSpotCard, RegularSpotCard } from '../../src/components/spot/SpotCard';
import { SpotKeyVisual } from '../../src/components/spot/SpotKeyVisual';
import { isRecommendableCategory } from '../../src/constants/spotCategories';
import { Icon } from '../../src/components/common/Icon';
import { sizeLabel, ageGroupLabel, walkingStyleLabels, temperamentLabels, relativeTime } from '../../src/utils/labels';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { HomeRailSkeleton } from '../../src/components/common/Skeleton';
import type { Dog, HomeSpotCardViewModel } from '../../src/types';

// ─── 강아지 아바타 ────────────────────────────────────────────────
function DogAvatar({ dog, size = 52 }: { dog: Dog; size?: number }) {
  if (dog.avatar_url) {
    return (
      <AppImage
        source={{ uri: dog.avatar_url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.brand.subtle }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, sa.avatarPlaceholder]}>
      <Text style={[sa.avatarInitial, { fontSize: size * 0.38 }]}>{dog.name[0]}</Text>
    </View>
  );
}

// ─── 강아지 선택 모달 ─────────────────────────────────────────────
function DogPickerModal({
  dogs, activeDogId, onSelect, onClose,
}: { dogs: Dog[]; activeDogId: string; onSelect: (dog: Dog) => void; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={sa.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={sa.modalCard}>
          <Text style={sa.modalTitle}>강아지 선택</Text>
          {dogs.map(dog => (
            <TouchableOpacity
              key={dog.dog_id}
              style={[sa.modalItem, dog.dog_id === activeDogId && sa.modalItemActive]}
              onPress={() => { onSelect(dog); onClose(); }}
            >
              <DogAvatar dog={dog} size={40} />
              <View style={sa.modalItemInfo}>
                <Text style={[sa.modalItemName, dog.dog_id === activeDogId && sa.modalItemNameActive]}>
                  {dog.name}
                </Text>
                <Text style={sa.modalItemSub}>
                  {dog.breed ?? sizeLabel[dog.size]} · {ageGroupLabel[dog.age_group]}
                </Text>
              </View>
              {dog.dog_id === activeDogId && (
                <Icon name="check" size={18} color={Colors.brand.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── 오늘의 추천 스팟 카드 ───────────────────────────────────────
function FeaturedCard({
  card, isSaved, onPress, onSave,
}: {
  card: HomeSpotCardViewModel;
  isSaved: boolean;
  onPress: () => void;
  onSave: () => void;
}) {
  return (
    <TouchableOpacity style={s.featuredCard} onPress={onPress} activeOpacity={0.92}>
      {/* 키비주얼은 장소 상세와 같은 컴포넌트를 쓴다 — 두 화면이 어긋나지 않도록.
          분위기 칩·개인화 문구는 카드에서 뺐다. 추천 카드가 판단을 대신 해주는 자리는
          아니고, 자세한 건 상세에서 본다. */}
      <SpotKeyVisual
        height={228}
        name={card.name}
        categoryLabel={card.category_label}
        subcategory={card.subcategory}
        coverImageUrl={card.cover_image_url}
        metaText={card.distance_text}
        savedCount={card.saved_count}
        saved={isSaved}
        onSave={onSave}
        topLeft={
          <View style={s.featuredBadge}>
            <Icon name="leaf-filled" size={10} color={Colors.brand.primary} />
            <Text style={s.featuredBadgeText}>오늘의 추천</Text>
          </View>
        }
      />
    </TouchableOpacity>
  );
}

// ─── 메인 화면 ──────────────────────────────────────────────────────
export default function HomeScreen() {
  const router         = useRouter();
  const dog            = useAppStore(s => s.dog);
  const dogs           = useAppStore(s => s.dogs);
  const setActiveDog   = useAppStore(s => s.setActiveDog);
  const visitSummaries = useAppStore(s => s.visitSummaries);
  const savedSpots     = useAppStore(s => s.savedSpots);
  const toggleSaveSpot = useAppStore(s => s.toggleSaveSpot);
  const getHomeCards   = useAppStore(s => s.getHomeCards);
  const spots          = useAppStore(s => s.spots);
  const currentLocation = useAppStore(s => s.currentLocation);
  const isSpotsLoading  = useAppStore(s => s.isSpotsLoading);
  // getHomeCards가 읽는 상태 — dep 배열과 짝을 맞추기 위해 함께 구독한다
  const spotAggregates  = useAppStore(s => s.spotAggregates);
  const checkins        = useAppStore(s => s.checkins);
  const blockedUsers    = useAppStore(s => s.blockedUsers);
  const { refreshing, onRefresh } = usePullToRefresh();

  // ⚠️ getHomeCards는 안정적인 zustand 액션 참조라 [getHomeCards]로 memo하면 마운트 시 1회만
  //    계산되고 spots가 비동기 로드돼도 갱신되지 않음 → 실제 데이터 의존값을 dep에 넣어 재계산.
  // ⚠️ dep는 getHomeCards가 실제로 읽는 상태와 정확히 같아야 한다.
  //    (spots · spotAggregates · checkins · visitSummaries · dog · currentLocation · blockedUsers)
  //    없던 것: blockedUsers — 차단해도 홈 카드에 그 강아지 발도장이 계속 집계됐다.
  //             spotAggregates·checkins — 집계만 갱신되면 카드가 안 바뀐다.
  //    있던 것: savedSpots·isSpotsLoading — getHomeCards가 읽지 않는다.
  //             저장 토글·로딩 토글마다 150장을 통째로 다시 만들고 있었다.
  const cards    = useMemo(
    () => getHomeCards(),
    [getHomeCards, spots, spotAggregates, checkins, visitSummaries, dog, currentLocation, blockedUsers],
  );
  // 성능: featuredCards 등에서 spots.find(O(n))를 루프로 돌지 않도록 spot_id → Spot Map 1회 구성
  const spotsById = useMemo(() => new Map(spots.map(s => [s.spot_id, s])), [spots]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [featuredPage, setFeaturedPage] = useState(0);
  const multiDog = dogs.length > 1;

  // 홈 진입 추적 (마운트 시 1회)
  useEffect(() => {
    track(EVENT.home_viewed, { screen_name: 'home' });
  }, []);

  // ── 오늘의 추천 스팟 (3개 카드, 가로 스와이프) ────────────────────
  // 규칙:
  //   1) 발도장이 있으면 → 가장 최근 발도장 위치 중심으로 2km 이내, 미방문 장소 우선
  //   2) 발도장이 없고 currentLocation이 있으면 → 현 위치 기준 2km 이내 미방문 우선
  //   3) 둘 다 없으면 → cards 배열 앞쪽 3개 (기본 홈 베이스)
  const featuredCards = useMemo(() => {
    // 동물병원·미용·호텔은 추천에서 뺀다. 가까워서 좋은 곳이 아니라
    // 필요할 때 찾는 곳이라, 거리순으로 들이밀면 방해만 된다.
    // (최근 간 곳·자주 가는 곳에는 그대로 나온다 — 그건 기록이지 추천이 아니다)
    const pool = cards.filter(c => isRecommendableCategory(c.category));
    if (pool.length === 0) return [];

    let center: { lat: number; lng: number } | null = null;
    if (dog) {
      const mine = visitSummaries.filter(vs => vs.dog_id === dog.dog_id);
      if (mine.length > 0) {
        const latest = mine.reduce((a, b) =>
          new Date(a.last_visit_at) > new Date(b.last_visit_at) ? a : b
        );
        const lastSpot = spotsById.get(latest.spot_id);
        if (lastSpot) center = { lat: lastSpot.latitude, lng: lastSpot.longitude };
      }
    }
    if (!center && currentLocation) {
      center = { lat: currentLocation.latitude, lng: currentLocation.longitude };
    }
    if (!center) return pool.slice(0, 3);

    // 2km 이내 후보 추출 + 거리 정렬
    const within = pool
      .map(c => {
        const sp = spotsById.get(c.spot_id);
        if (!sp) return null;
        const d = haversineDistance(center!.lat, center!.lng, sp.latitude, sp.longitude);
        if (d > 2000 || d < 30) return null;
        return { card: c, dist: d };
      })
      .filter((x): x is { card: typeof pool[0]; dist: number } => x !== null)
      .sort((a, b) => a.dist - b.dist);

    // 미방문 우선 + 방문한 곳 차순 → 최대 3개
    const unvisited = within.filter(({ card }) => !card.has_visited);
    const visited   = within.filter(({ card }) =>  card.has_visited);
    const merged = [...unvisited, ...visited].slice(0, 3).map(x => x.card);
    return merged.length > 0 ? merged : pool.slice(0, 3);
  }, [cards, dog, visitSummaries, spots, currentLocation]);

  const isFeaturedSaved = useCallback((spotId: string) =>
    savedSpots.some(sv => sv.spot_id === spotId && sv.dog_id === dog?.dog_id),
  [savedSpots, dog]);

  // ── 최근 간 장소 ──────────────────────────────────────────────────
  const recentCards = useMemo(() =>
    cards
      .filter(c => c.has_visited && c.last_visit_at)
      .sort((a, b) => new Date(b.last_visit_at!).getTime() - new Date(a.last_visit_at!).getTime())
      .slice(0, 6),
  [cards]);

  // ── 자주 가는 장소 ────────────────────────────────────────────────
  const regularCards = useMemo(() =>
    cards
      .filter(c => c.has_visited && (c.visit_count ?? 0) > 0)
      .sort((a, b) => (b.visit_count ?? 0) - (a.visit_count ?? 0))
      .slice(0, 6),
  [cards]);

  // ── 강아지 태그 (기질 + 산책스타일, 최대 3개) ─────────────────────
  const dogTags = useMemo(() => {
    if (!dog) return [];
    const t = dog.temperament_tags.map(t => temperamentLabels[t]).filter(Boolean);
    const w = dog.walking_style_tags.map(t => walkingStyleLabels[t]).filter(Boolean);
    return [...t, ...w].slice(0, 3);
  }, [dog]);

  // ── 프로필 서브 텍스트: 품종 · 나이 · 체중 ────────────────────────
  const dogSubText = useMemo(() => {
    if (!dog) return '';
    const parts: string[] = [];
    if (dog.breed) parts.push(dog.breed);
    parts.push(ageGroupLabel[dog.age_group]);
    if (dog.weight_kg) parts.push(`${dog.weight_kg}kg`);
    return parts.join(' · ');
  }, [dog]);

  // ── 최근 산책 — 방문 기록 중 가장 최신 last_visit_at ──────────────
  const lastWalkText = useMemo(() => {
    if (!dog) return null;
    const mine = visitSummaries.filter(vs => vs.dog_id === dog.dog_id);
    if (mine.length === 0) return null;
    const latest = mine.reduce((a, b) =>
      new Date(a.last_visit_at) > new Date(b.last_visit_at) ? a : b
    );
    return relativeTime(latest.last_visit_at);
  }, [dog, visitSummaries]);

  const handlePressCard = useCallback((spotId: string, source: 'recommended' | 'recent' | 'frequent' = 'recommended') => {
    const eventName =
      source === 'recent'    ? EVENT.recent_place_clicked   :
      source === 'frequent'  ? EVENT.frequent_place_clicked :
                               EVENT.recommended_place_clicked;
    track(eventName, { screen_name: 'home', source_screen: 'home', place_id: spotId });
    router.push(`/spot/${spotId}`);
  }, [router]);

  const handleFeaturedSave = useCallback((spotId: string) => {
    // 강아지 미등록이면 저장 불가 — 등록 유도
    if (!dog) {
      confirm('강아지를 등록하면 마음에 든 장소를 저장할 수 있어요.', {
        title: '강아지 등록이 필요해요',
        confirmText: '등록하러 가기',
      }).then(ok => { if (ok) router.push('/(auth)/dog-setup'); });
      return;
    }
    const wasSaved = savedSpots.some(sv => sv.spot_id === spotId && sv.dog_id === dog?.dog_id);
    track(wasSaved ? EVENT.place_unsaved : EVENT.place_saved, {
      screen_name: 'home', place_id: spotId,
    });
    toggleSaveSpot(spotId);
  }, [toggleSaveSpot, savedSpots, dog, router]);

  // 강아지 미등록이어도 홈은 그대로 노출(장소 추천·섹션 유지) — 프로필 카드 자리에 등록 유도 배너만 표시

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {pickerOpen && dog && (
        <DogPickerModal
          dogs={dogs}
          activeDogId={dog.dog_id}
          onSelect={(d) => setActiveDog(d)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brand.primary}
            colors={[Colors.brand.primary]}
          />
        }
      >

        {/* ── 상단 로고 헤더 (공식 로고: 마크 + 워드마크) ── */}
        <View style={s.topBar}>
          <View style={s.logoRow}>
            <Image
              source={require('../../assets/logo-mark.png')}
              style={s.logoMark}
              resizeMode="contain"
              accessibilityLabel="DogEar 로고"
            />
            <Image
              source={require('../../assets/logo-wordmark.png')}
              style={s.logoWordmark}
              resizeMode="contain"
              accessibilityLabel="DogEar"
            />
          </View>
          <TouchableOpacity style={s.notifBtn} accessibilityLabel="알림" onPress={() => router.push('/notifications')}>
            <Icon name="bell" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── 강아지 미등록: 컴팩트 등록 유도 배너 (홈 기능은 그대로 사용 가능) ── */}
        {!dog && (
          <TouchableOpacity
            style={[s.noDogBanner, Shadow.s]}
            onPress={() => router.push('/(auth)/dog-setup')}
            activeOpacity={0.85}
            accessibilityLabel="강아지 등록하기"
          >
            <View style={s.noDogBannerIcon}>
              <Icon name="paw-filled" size={20} color={Colors.brand.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.noDogBannerTitle}>강아지를 등록해보세요</Text>
              <Text style={s.noDogBannerSub}>맞춤 추천과 발도장 기록이 열려요</Text>
            </View>
            <Icon name="forward" size={16} color={Colors.brand.primary} />
          </TouchableOpacity>
        )}

        {/* ── 강아지 프로필 카드 ── */}
        {dog && (
          <TouchableOpacity
            style={[s.profileCard, Shadow.s]}
            onPress={() => router.push('/dog-detail' as any)}
            activeOpacity={0.85}
          >
            {/* 아바타 */}
            <DogAvatar dog={dog} size={68} />

            {/* 이름 + 정보 */}
            <View style={s.profileInfo}>
              {/* 이름 + 드롭다운 */}
              <TouchableOpacity
                style={s.profileNameRow}
                onPress={multiDog ? () => setPickerOpen(true) : undefined}
                activeOpacity={multiDog ? 0.7 : 1}
              >
                <Text style={s.profileName}>{dog.name}</Text>
                {multiDog && <Icon name="down" size={15} color={Colors.text.secondary} />}
              </TouchableOpacity>

              {/* 품종 · 나이 · 체중 */}
              <Text style={s.profileSub}>{dogSubText}</Text>

              {/* 기질·산책 태그 */}
              {dogTags.length > 0 && (
                <View style={s.profileTagRow}>
                  {dogTags.map(tag => (
                    <View key={tag} style={s.profileTag}>
                      <Text style={s.profileTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 최근 산책 */}
              {lastWalkText && (
                <View style={s.profileWalkRow}>
                  <Icon name="walk" size={12} color={Colors.text.tertiary} />
                  <Text style={s.profileWalkText}>최근 산책 · {lastWalkText}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* (강아지 미등록 안내는 상단 noDogBanner로 통합 — dog-setup으로 라우팅) */}

        {/* ── 로딩 스켈레톤 (주변 스팟 페치 중 + 아직 카드 없음) ── */}
        {dog && cards.length === 0 && isSpotsLoading && (
          <View style={s.sectionWrap}>
            <HomeRailSkeleton />
          </View>
        )}

        {/* 위치 권한/주변 데이터와 무관하게 '오늘의 추천 스팟'은 항상 노출한다(서버 폴백으로 서울 대표 장소). */}

        {/* ── 오늘의 추천 스팟 (3개, 가로 스와이프) — 비어 있어도 영역 노출 ── */}
        {featuredCards.length === 0 && (
          <View style={s.sectionWrap}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>오늘의 추천 스팟</Text>
            </View>
            <View style={s.sectionEmpty}>
              <Text style={s.sectionEmptyText}>주변 장소를 찾으면 추천이 여기에 표시돼요.{'\n'}탐색 탭에서 지도를 옮겨 둘러보세요.</Text>
            </View>
          </View>
        )}
        {featuredCards.length > 0 && (
          <View style={s.sectionWrap}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>오늘의 추천 스팟</Text>
              {featuredCards.length > 1 && (
                <Text style={s.featuredCountIndicator}>
                  {featuredPage + 1} / {featuredCards.length}
                </Text>
              )}
            </View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const w = e.nativeEvent.layoutMeasurement.width;
                const x = e.nativeEvent.contentOffset.x;
                const page = Math.round(x / w);
                if (page !== featuredPage) setFeaturedPage(page);
              }}
              scrollEventThrottle={16}
              decelerationRate="fast"
            >
              {featuredCards.map(card => (
                <View key={card.spot_id} style={{ width: Dimensions.get('window').width }}>
                  <FeaturedCard
                    card={card}
                    isSaved={isFeaturedSaved(card.spot_id)}
                    onPress={() => handlePressCard(card.spot_id)}
                    onSave={() => handleFeaturedSave(card.spot_id)}
                  />
                </View>
              ))}
            </ScrollView>
            {/* 페이지 도트 */}
            {featuredCards.length > 1 && (
              <View style={s.featuredDots}>
                {featuredCards.map((_, i) => (
                  <View
                    key={i}
                    style={[s.featuredDot, i === featuredPage && s.featuredDotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── 최근 간 장소 — 비어 있어도 영역 노출 ── */}
        <View style={s.sectionWrap}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>최근 간 장소</Text>
            {recentCards.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/my-spots')}>
                <View style={s.sectionMoreBtn}>
                  <Text style={s.sectionMore}>전체보기</Text>
                  <Icon name="forward" size={11} color={Colors.text.tertiary} />
                </View>
              </TouchableOpacity>
            )}
          </View>
          {recentCards.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.rail}
            >
              {recentCards.map(card => (
                <RecentSpotCard
                  key={card.spot_id}
                  card={card}
                  onPress={() => handlePressCard(card.spot_id, 'recent')}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={s.sectionEmpty}>
              <Text style={s.sectionEmptyText}>아직 다녀온 곳이 없어요. 첫 발도장을 남겨보세요!</Text>
            </View>
          )}
        </View>

        {/* ── 자주 가는 장소 — 비어 있어도 영역 노출 ── */}
        <View style={s.sectionWrap}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>자주 가는 장소</Text>
            {regularCards.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/my-spots')}>
                <View style={s.sectionMoreBtn}>
                  <Text style={s.sectionMore}>전체보기</Text>
                  <Icon name="forward" size={11} color={Colors.text.tertiary} />
                </View>
              </TouchableOpacity>
            )}
          </View>
          {regularCards.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.rail}
            >
              {regularCards.map(card => (
                <RegularSpotCard
                  key={card.spot_id}
                  card={card}
                  onPress={() => handlePressCard(card.spot_id, 'frequent')}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={s.sectionEmpty}>
              <Text style={s.sectionEmptyText}>같은 곳에 발도장이 쌓이면 여기에 표시돼요.</Text>
            </View>
          )}
        </View>

        {/* ── 첫 사용자 가이드 — 발도장 0개 + 자주 가는 장소 0개일 때 ── */}
        {dog && cards.length > 0 && recentCards.length === 0 && regularCards.length === 0 && (
          <View style={s.starterCard}>
            <View style={s.starterHeader}>
              <View style={s.starterIconWrap}>
                <Icon name="paw-filled" size={20} color={Colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.starterTitle}>{dog.name}와 함께 시작해볼까요?</Text>
                <Text style={s.starterSub}>3단계로 첫 발도장을 남길 수 있어요</Text>
              </View>
            </View>
            <View style={s.starterSteps}>
              <View style={s.starterStep}>
                <View style={s.starterStepNum}><Text style={s.starterStepNumText}>1</Text></View>
                <Text style={s.starterStepText}>주변 추천 장소 또는 지도에서 산책할 곳 고르기</Text>
              </View>
              <View style={s.starterStep}>
                <View style={s.starterStepNum}><Text style={s.starterStepNumText}>2</Text></View>
                <Text style={s.starterStepText}>장소 상세에서 [발도장 남기기] 누르기</Text>
              </View>
              <View style={s.starterStep}>
                <View style={s.starterStepNum}><Text style={s.starterStepNumText}>3</Text></View>
                <Text style={s.starterStepText}>오늘의 느낌과 공개 범위 선택 → 완료!</Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.starterCta}
              onPress={() => router.push('/(tabs)/map')}
              activeOpacity={0.88}
            >
              <Icon name="map" size={16} color="#fff" />
              <Text style={s.starterCtaText}>지도에서 첫 장소 찾기</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 지도 탐색 배너 (재방문 사용자 — 발도장 있는 경우에만) ── */}
        {(recentCards.length > 0 || regularCards.length > 0) && (
          <TouchableOpacity
            style={s.mapBtn}
            onPress={() => router.push('/(tabs)/map')}
            activeOpacity={0.82}
          >
            <View style={s.mapBtnIconWrap}>
              <Icon name="map" size={16} color={Colors.brand.onPrimary} />
            </View>
            <Text style={s.mapBtnText}>지도에서 주변 장소 탐색하기</Text>
            <Icon name="forward" size={14} color={Colors.brand.primary} />
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 모달 스타일 ──────────────────────────────────────────────────
const sa = StyleSheet.create({
  avatarPlaceholder: {
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  avatarInitial: { color: Colors.brand.accent, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: 280,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    paddingVertical: Spacing[20],
    paddingHorizontal: Spacing[20],
    gap: Spacing[4],
    ...Shadow.l,
  },
  modalTitle: { ...Typography.title.s, color: Colors.text.primary, fontWeight: '700', marginBottom: Spacing[8] },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[12], paddingVertical: Spacing[12], paddingHorizontal: Spacing[10], borderRadius: Radius.m },
  modalItemActive: { backgroundColor: Colors.brand.subtle },
  modalItemInfo: { flex: 1, gap: Spacing[2] },
  modalItemName: { ...Typography.label.l, color: Colors.text.primary, fontWeight: '600' },
  modalItemNameActive: { color: Colors.brand.accent },
  modalItemSub: { ...Typography.caption, color: Colors.text.tertiary },
});

// ─── 메인 스타일 ──────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg.primary },
  scroll:  { flex: 1 },
  content: { paddingBottom: 40 },
  // 강아지 미등록 빈 상태
  // 강아지 미등록 배너 (홈 비차단)
  noDogBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[12],
    marginHorizontal: Spacing[20], marginBottom: Spacing[16],
    padding: Spacing[16],
    borderRadius: Radius.l,
    backgroundColor: Colors.surface.default,
    borderWidth: 1, borderColor: Colors.border.brand,
  },
  noDogBannerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  noDogBannerTitle: { ...Typography.title.s, color: Colors.text.primary, fontWeight: '700' },
  noDogBannerSub:   { ...Typography.body.s, color: Colors.text.tertiary, marginTop: 2 },

  // 빈 섹션 상태 (영역은 유지)
  sectionEmpty: {
    marginHorizontal: Spacing[20],
    paddingVertical: Spacing[20], paddingHorizontal: Spacing[16],
    borderRadius: Radius.l,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  sectionEmptyText: { ...Typography.body.s, color: Colors.text.tertiary, textAlign: 'center' },

  // ── 상단 로고 바 ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[16],
    paddingBottom: Spacing[10],
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
  },
  logoMark:     { width: 26, height: 27 },   // 마크 비율 403:412
  logoWordmark: { width: 64, height: 21 },   // 워드마크 비율 511:168
  notifBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },

  // ── 강아지 프로필 카드 ──
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[14],
    backgroundColor: Colors.brand.subtle,
    marginHorizontal: Spacing[16],
    marginBottom: Spacing[4],
    borderRadius: Radius.card,
    padding: Spacing[20],
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
  },
  profileInfo: { flex: 1, gap: Spacing[4] },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  profileName: {
    ...Typography.title.m,
    color: Colors.text.primary,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  profileSub: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  profileTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[6],
    marginTop: Spacing[6],
  },
  profileTag: {
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: Spacing[10],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  profileTagText: {
    ...Typography.label.s,
    color: Colors.brand.accent,
    fontWeight: '600',
  },
  profileWalkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    marginTop: Spacing[6],
  },
  profileWalkText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },

  // ── 섹션 공통 ──
  sectionWrap: {
    marginTop: Spacing[24],
    gap: Spacing[12],
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[16],
  },
  sectionTitle: {
    ...Typography.title.s,
    color: Colors.text.primary,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionMore: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },

  // ── 추천 스팟 페이지네이션 ──
  featuredCountIndicator: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  featuredDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[6],
    marginTop: Spacing[12],
  },
  featuredDot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border.default,
  },
  featuredDotActive: {
    width: 18,
    backgroundColor: Colors.brand.primary,
  },

  // ── 오늘의 추천 카드 (이미지 오버레이 방식) ──
  featuredCard: {
    marginHorizontal: Spacing[16],
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  // 이미지·스크림·오버레이·저장은 SpotKeyVisual이 그린다(장소 상세와 공용).
  // 여기 남는 건 카드 테두리와 '오늘의 추천' 배지뿐이다.
  featuredBadge: {
    backgroundColor: Colors.surface.default,
    paddingHorizontal: Spacing[10],
    paddingVertical: 5,
    borderRadius: Radius.round,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    ...Shadow.m,
  },
  featuredBadgeText: {
    ...Typography.label.s,
    color: Colors.text.primary,
    fontWeight: '700',
  },

  // ── 수평 레일 ──
  rail: {
    paddingHorizontal: Spacing[16],
    gap: Spacing[12],
    paddingBottom: Spacing[4],
  },

  // ── 지도 탐색 배너 ──
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[12],
    marginHorizontal: Spacing[16],
    marginTop: Spacing[24],
    marginBottom: Spacing[8],
    paddingVertical: Spacing[16],
    paddingHorizontal: Spacing[20],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
  },
  mapBtnIconWrap: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtnText: {
    flex: 1,
    ...Typography.label.m,
    color: Colors.brand.accent,
    fontWeight: '700',
  },

  // ── 첫 사용자 시작 가이드 카드 ──
  starterCard: {
    marginHorizontal: Spacing[16],
    marginTop: Spacing[24],
    marginBottom: Spacing[8],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
    padding: Spacing[16],
  },
  starterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[12],
    marginBottom: Spacing[14],
  },
  starterIconWrap: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border.brand,
  },
  starterTitle: {
    ...Typography.title.s,
    color: Colors.text.primary,
    fontWeight: '800',
    marginBottom: 2,
  },
  starterSub: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  starterSteps: {
    gap: Spacing[10],
    marginBottom: Spacing[14],
  },
  starterStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[10],
  },
  starterStepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterStepNumText: {
    ...Typography.caption,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  starterStepText: {
    flex: 1,
    ...Typography.body.s,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  starterCta: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.round,
  },
  starterCtaText: {
    ...Typography.label.l,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
