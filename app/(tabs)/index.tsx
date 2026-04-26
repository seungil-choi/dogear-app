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

import React, { useMemo, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Shadow, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { RecentSpotCard, RegularSpotCard } from '../../src/components/spot/SpotCard';
import { Icon } from '../../src/components/common/Icon';
import { sizeLabel, ageGroupLabel, walkingStyleLabels, temperamentLabels } from '../../src/utils/labels';
import { EmptyState } from '../../src/components/common/EmptyState';
import type { Dog, HomeSpotCardViewModel } from '../../src/types';

// ─── 강아지 아바타 ────────────────────────────────────────────────
function DogAvatar({ dog, size = 52 }: { dog: Dog; size?: number }) {
  if (dog.avatar_url) {
    return (
      <Image
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
      <View style={s.featuredImageWrap}>
        {card.cover_image_url ? (
          <Image source={{ uri: card.cover_image_url }} style={s.featuredImage} resizeMode="cover" />
        ) : (
          <View style={[s.featuredImage, s.featuredImageFallback]}>
            <Icon name="leaf-filled" size={44} color={Colors.brand.primary} />
          </View>
        )}

        {/* Bottom scrim — warm gradient, fades naturally */}
        <LinearGradient
          colors={['transparent', 'rgba(18,12,6,0.18)', 'rgba(18,12,6,0.72)']}
          locations={[0, 0.45, 1]}
          style={s.featuredScrim}
        />

        {/* Text floating on scrim */}
        <View style={s.featuredOverlay}>
          <Text style={s.featuredName} numberOfLines={1}>{card.name}</Text>
          {card.atmosphere_badges.length > 0 && (
            <View style={s.featuredTagRow}>
              {card.atmosphere_badges.slice(0, 2).map(b => (
                <View key={b} style={s.featuredTag}>
                  <Text style={s.featuredTagText}>{b}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.featuredMetaRow}>
            <Icon name="location" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={s.featuredMetaText}>{card.distance_text}</Text>
          </View>
        </View>

        {/* Top-left badge */}
        <View style={s.featuredBadge}>
          <Icon name="leaf-filled" size={10} color={Colors.brand.primary} />
          <Text style={s.featuredBadgeText}>오늘의 추천</Text>
        </View>

        {/* 저장하기 */}
        <TouchableOpacity style={s.featuredHeart} onPress={onSave} activeOpacity={0.8}>
          <Icon
            name={isSaved ? 'bookmark-filled' : 'bookmark'}
            size={17}
            color={isSaved ? Colors.brand.primary : Colors.text.secondary}
          />
        </TouchableOpacity>
      </View>
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

  const cards    = useMemo(() => getHomeCards(), [getHomeCards]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const multiDog = dogs.length > 1;

  // ── 오늘의 추천 스팟 ──────────────────────────────────────────────
  const featuredCard = cards[0] ?? null;
  const isFeaturedSaved = useMemo(() =>
    featuredCard ? savedSpots.some(sv => sv.spot_id === featuredCard.spot_id && sv.dog_id === dog?.dog_id) : false,
  [featuredCard, savedSpots, dog]);

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

  const handlePressCard = useCallback((spotId: string) => {
    router.push(`/spot/${spotId}`);
  }, [router]);

  const handleFeaturedSave = useCallback(() => {
    if (featuredCard) toggleSaveSpot(featuredCard.spot_id);
  }, [featuredCard, toggleSaveSpot]);

  return (
    <SafeAreaView style={s.safe}>
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
      >

        {/* ── 상단 로고 헤더 ── */}
        <View style={s.topBar}>
          <View style={s.logoRow}>
            <Icon name="paw-filled" size={20} color={Colors.brand.primary} />
            <Text style={s.logoText}>Dogear</Text>
          </View>
          <TouchableOpacity style={s.notifBtn} accessibilityLabel="알림" onPress={() => router.push('/notifications')}>
            <Icon name="bell" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── 강아지 프로필 카드 ── */}
        {dog && (
          <TouchableOpacity
            style={[s.profileCard, Shadow.s]}
            onPress={() => router.push('/dog-edit')}
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
            </View>
          </TouchableOpacity>
        )}

        {/* ── 강아지 미등록 안내 ── */}
        {!dog && (
          <View style={s.emptyWrap}>
            <EmptyState
              headline="우리 아이를 먼저 소개해주세요"
              description="강아지 프로필을 만들면 맞춤 산책 장소를 추천해드려요."
              ctaLabel="강아지 등록하기"
              onCta={() => router.push('/dog-edit')}
            />
          </View>
        )}

        {/* ── 빈 상태 (강아지는 있는데 주변 장소 데이터가 없을 때) ── */}
        {dog && cards.length === 0 && (
          <View style={s.emptyWrap}>
            <EmptyState
              headline="아직 주변 장소 정보가 없어요"
              description="위치 권한을 허용하면 근처 산책 장소를 바로 추천해드려요."
              ctaLabel="지도에서 탐색하기"
              onCta={() => router.push('/(tabs)/map')}
            />
          </View>
        )}

        {/* ── 오늘의 추천 스팟 ── */}
        {featuredCard && (
          <View style={s.sectionWrap}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>오늘의 추천 스팟</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/map')}>
                <View style={s.sectionMoreBtn}>
                  <Text style={s.sectionMore}>전체보기</Text>
                  <Icon name="forward" size={11} color={Colors.text.tertiary} />
                </View>
              </TouchableOpacity>
            </View>
            <FeaturedCard
              card={featuredCard}
              isSaved={isFeaturedSaved}
              onPress={() => handlePressCard(featuredCard.spot_id)}
              onSave={handleFeaturedSave}
            />
          </View>
        )}

        {/* ── 최근 간 장소 ── */}
        {recentCards.length > 0 && (
          <View style={s.sectionWrap}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>최근 간 장소</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/my-spots')}>
                <View style={s.sectionMoreBtn}>
                  <Text style={s.sectionMore}>전체보기</Text>
                  <Icon name="forward" size={11} color={Colors.text.tertiary} />
                </View>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.rail}
            >
              {recentCards.map(card => (
                <RecentSpotCard
                  key={card.spot_id}
                  card={card}
                  onPress={() => handlePressCard(card.spot_id)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 자주 가는 장소 ── */}
        {regularCards.length > 0 && (
          <View style={s.sectionWrap}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>자주 가는 장소</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/my-spots')}>
                <View style={s.sectionMoreBtn}>
                  <Text style={s.sectionMore}>전체보기</Text>
                  <Icon name="forward" size={11} color={Colors.text.tertiary} />
                </View>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.rail}
            >
              {regularCards.map(card => (
                <RegularSpotCard
                  key={card.spot_id}
                  card={card}
                  onPress={() => handlePressCard(card.spot_id)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 지도 탐색 배너 ── */}
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
  emptyWrap: { minHeight: 280, paddingHorizontal: Spacing[16] },

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
    gap: Spacing[6],
  },
  logoText: {
    ...Typography.title.l,
    color: Colors.text.primary,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontSize: 22,
  },
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
    fontSize: 11,
    fontWeight: '600',
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

  // ── 오늘의 추천 카드 (이미지 오버레이 방식) ──
  featuredCard: {
    marginHorizontal: Spacing[16],
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  featuredImageWrap: {
    height: 228,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.bg.tertiary,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredImageFallback: {
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredScrim: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 160,
  },
  featuredOverlay: {
    position: 'absolute',
    bottom: Spacing[16],
    left: Spacing[16],
    right: Spacing[16],
    gap: Spacing[4],
  },
  featuredTagRow: {
    flexDirection: 'row',
    gap: Spacing[6],
    marginBottom: Spacing[4],
  },
  featuredTag: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: Spacing[10],
    paddingVertical: 3,
    borderRadius: Radius.round,
  },
  featuredTagText: {
    ...Typography.label.s,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
  },
  featuredName: {
    ...Typography.title.l,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  featuredMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
    marginTop: 2,
  },
  featuredMetaText: {
    ...Typography.body.s,
    color: 'rgba(255,255,255,0.72)',
  },
  featuredMetaDot: {
    width: 3, height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  featuredBadge: {
    position: 'absolute',
    top: Spacing[14],
    left: Spacing[14],
    backgroundColor: Colors.surface.default,
    paddingHorizontal: Spacing[10],
    paddingVertical: 5,
    borderRadius: Radius.round,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 3,
  },
  featuredBadgeText: {
    ...Typography.label.s,
    color: Colors.text.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  featuredHeart: {
    position: 'absolute',
    top: Spacing[12],
    right: Spacing[12],
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 3,
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
});
