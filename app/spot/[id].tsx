/**
 * 장소 상세 — 풀 버전
 *
 * 레퍼런스 이미지 반영:
 *  - 히어로 이미지 위 장소명·거리·카테고리 오버레이
 *  - 현황 카드 (발도장수 / 분위기 / 태그) + 발도장·저장 CTA
 *  - 우리 보리와의 관계 (첫 방문 / 방문 횟수 / 최근 방문 / 단골 여부)
 *  - 자주 오는 강아지 (원형 아바타)
 *  - 최근 흔적 (사진 썸네일 포함)
 *  - 장소 정보 (유형·운영·특징·주의사항·주소)
 *  - 하단 바 (길찾기 + 발도장 남기기)
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Linking, Alert, Platform, Share, Modal, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Icon } from '../../src/components/common/Icon';
import type { FamiliarDogCardViewModel } from '../../src/types';


export default function SpotDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  // id는 string[] 로 올 수도 있음 (catch-all route) — 항상 첫 번째 값 사용
  const id     = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const getSpotDetail  = useAppStore(s => s.getSpotDetail);
  const toggleSaveSpot = useAppStore(s => s.toggleSaveSpot);
  const setPawSpot     = useAppStore(s => s.setPawSpot);
  const getHomeCards   = useAppStore(s => s.getHomeCards);

  const vm = getSpotDetail(id);

  // ── 자주 찾는 강아지 UI 상태 ─────────────────────────────────
  // 기본 3마리 노출, 더보기로 최대 6마리까지 확장
  const [familiarExpanded, setFamiliarExpanded] = useState(false);
  const [selectedDog, setSelectedDog] = useState<FamiliarDogCardViewModel | null>(null);

  const handleSave = useCallback(() => toggleSaveSpot(id), [id, toggleSaveSpot]);

  const handlePawCheckin = useCallback(() => {
    const cards = getHomeCards();
    const card  = cards.find(c => c.spot_id === id);
    if (card) setPawSpot(card);
    router.push('/paw-checkin');
  }, [id, getHomeCards, setPawSpot, router]);

  const handleDirections = useCallback(() => {
    if (vm?.address_text) {
      Linking.openURL(
        `https://map.naver.com/v5/search/${encodeURIComponent(vm.address_text)}`
      );
    }
  }, [vm]);

  const handleShare = useCallback(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share && vm) {
      (navigator as any).share({ title: vm.name, url: typeof window !== 'undefined' ? window.location.href : '' }).catch(() => {});
    } else if (vm) {
      Share.share({ title: vm.name, message: vm.name }).catch(() => {});
    }
  }, [vm]);

  const handleMore = useCallback(() => {
    Alert.alert(
      vm?.name ?? '장소',
      undefined,
      [
        { text: '신고하기', style: 'destructive', onPress: () => router.push({ pathname: '/report', params: { target_type: 'spot', target_id: id } } as any) },
        { text: '취소', style: 'cancel' },
      ],
    );
  }, [vm, id, router]);

  if (!vm) {
    return (
      <View style={[s.safe, { paddingTop: insets.top }]}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[8] }}>
          <TouchableOpacity
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => router.back()}
            accessibilityLabel="뒤로 가기"
          >
            <Icon name="back" size={22} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>
        <EmptyState
          headline="장소를 찾을 수 없어요"
          description="삭제되었거나 일시적으로 표시할 수 없어요."
          ctaLabel="돌아가기"
          onCta={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={s.safe}>

      {/* ════════════════════════════════════
          스크롤 본문 (히어로 포함, 함께 스크롤)
      ════════════════════════════════════ */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 히어로 이미지 ── */}
        <View style={[s.heroWrap, { height: HERO_H + insets.top }]}>
          {vm.cover_image_url ? (
            <Image
              source={{ uri: vm.cover_image_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.heroPlaceholder]}>
              <Icon name="leaf-filled" size={56} color={Colors.brand.primary} />
            </View>
          )}

          {/* 하단 그라디언트 dim */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.62)']}
            style={s.heroGradient}
          />

          {/* 장소명 + 메타 (이미지 위 오버레이) */}
          <View style={s.heroBottom}>
            <View style={s.heroTitleRow}>
              <Text style={s.heroName} numberOfLines={2}>{vm.name}</Text>
              <TouchableOpacity onPress={handleSave}>
                <Icon
                  name={vm.is_saved ? 'bookmark-filled' : 'bookmark'}
                  size={20}
                  color={vm.is_saved ? Colors.brand.primaryLight : '#fff'}
                />
              </TouchableOpacity>
            </View>
            <View style={s.heroMeta}>
              <Icon name="location" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={s.heroMetaText}>{vm.distance_text}</Text>
            </View>
          </View>
        </View>

        {/* ── 현황 카드 ── */}
        <View style={s.statusCard}>
          <View style={s.statsRow}>
            {/* 최근 발도장 */}
            <View style={s.statItem}>
              <Icon name="paw-filled" size={16} color={Colors.brand.primary} />
              <Text style={s.statValue}>{vm.recent_trace_count}</Text>
              <Text style={s.statLabel}>최근 발도장</Text>
            </View>
            <View style={s.statDivider} />
            {/* 방문자 수 */}
            <View style={s.statItem}>
              <Icon name="leaf" size={16} color={Colors.brand.primary} />
              <Text style={s.statValue}>{vm.unique_visitor_count}</Text>
              <Text style={s.statLabel}>방문자 수</Text>
            </View>
            <View style={s.statDivider} />
            {/* 내 방문 횟수 */}
            <View style={s.statItem}>
              <Icon name="star" size={16} color={Colors.brand.primary} />
              <Text style={s.statValue}>{vm.user_relation?.visit_count ?? 0}회</Text>
              <Text style={s.statLabel}>내 방문 횟수</Text>
            </View>
          </View>

          {/* CTA — 저장하기 (발도장은 하단 고정 바에서) */}
          <TouchableOpacity
            style={[s.btnSave, s.btnSaveFull, vm.is_saved && s.btnSaveActive]}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Icon
              name={vm.is_saved ? 'bookmark-filled' : 'bookmark'}
              size={18}
              color={vm.is_saved ? Colors.brand.primary : Colors.text.secondary}
            />
            <Text style={[s.btnSaveText, vm.is_saved && s.btnSaveTextActive]}>
              {vm.is_saved ? '저장됨' : '저장하기'}
            </Text>
          </TouchableOpacity>
        </View>

{/* 자주 찾는 강아지 섹션 — 장소 정보 이후에 배치 (P3 최하위 우선순위) */}

        {/* ── 최근 흔적 ── */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>최근 흔적</Text>
            <TouchableOpacity style={s.sectionMore} onPress={() => router.push(`/visit-history/${id}` as any)}>
              <Text style={s.sectionMoreText}>더보기</Text>
              <Icon name="forward" size={12} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          {vm.recent_traces.length > 0 ? (
            <View style={s.traceList}>
              {vm.recent_traces.map((trace, idx) => (
                <TouchableOpacity
                  key={trace.trace_id}
                  style={[s.traceRow, idx < vm.recent_traces.length - 1 && s.traceRowBorder]}
                  activeOpacity={0.75}
                  onPress={() => router.push(`/visit-history/${id}` as any)}
                >
                  {/* 발 아이콘 */}
                  <View style={s.traceIconWrap}>
                    <Icon name="paw-filled" size={14} color={Colors.brand.primary} />
                  </View>

                  {/* 텍스트 */}
                  <View style={s.traceContent}>
                    <View style={s.traceTopRow}>
                      <Text style={s.traceTime}>{trace.relative_time_text}</Text>
                      {trace.primary_tag_label ? (
                        <View style={s.traceTag}>
                          <Text style={s.traceTagText}>{trace.primary_tag_label}</Text>
                        </View>
                      ) : null}
                    </View>
                    {trace.photo_count != null && trace.photo_count > 0 && (
                      <Text style={s.tracePhotoLabel}>사진 {trace.photo_count}장</Text>
                    )}
                    {trace.secondary_text && !trace.photo_count && (
                      <Text style={s.traceNote} numberOfLines={1}>{trace.secondary_text}</Text>
                    )}
                  </View>

                  {/* 사진 썸네일 자리 */}
                  {trace.has_photo && (
                    <View style={s.traceThumb}>
                      <Icon name="camera" size={16} color={Colors.text.tertiary} />
                    </View>
                  )}

                  <Icon name="forward" size={13} color={Colors.border.strong} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={s.noTrace}>
              <Icon name="paw" size={20} color={Colors.text.tertiary} />
              <Text style={s.noTraceText}>아직 흔적이 없어요. 첫 발도장을 남겨보세요!</Text>
            </View>
          )}
        </View>

        {/* ── 장소 정보 ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>장소 정보</Text>

          <View style={s.infoTable}>
            {/* 운영 */}
            {vm.opening_hours && (
              <>
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>운영</Text>
                  <Text style={s.infoVal}>{vm.opening_hours}</Text>
                </View>
                <View style={s.infoSep} />
              </>
            )}

            {/* 특징 */}
            {vm.features && vm.features.length > 0 && (
              <>
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>특징</Text>
                  <View style={s.featureChips}>
                    {vm.features.map(f => (
                      <View key={f} style={s.featureChip}>
                        <Text style={s.featureChipText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={s.infoSep} />
              </>
            )}

            {/* 주의사항 */}
            {vm.caution && (
              <>
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>주의사항</Text>
                  <Text style={s.infoVal}>{vm.caution}</Text>
                </View>
                <View style={s.infoSep} />
              </>
            )}

            {/* 주소 */}
            {vm.address_text && (
              <View style={s.infoRow}>
                <Text style={s.infoKey}>주소</Text>
                <Text style={s.infoVal}>{vm.address_text}</Text>
              </View>
            )}
          </View>

          {/* 지도 자리 (정적 placeholder) */}
          <TouchableOpacity style={s.mapPlaceholder} onPress={handleDirections} activeOpacity={0.85}>
            <Icon name="map" size={24} color={Colors.text.tertiary} />
            <Text style={s.mapPlaceholderText}>지도에서 보기</Text>
          </TouchableOpacity>
        </View>

        {/* ── 자주 찾는 강아지 (P3 — 장소 정보 이후 최하단) ── */}
        {(() => {
          const dogs    = vm.familiar_dogs;
          const visible = familiarExpanded ? dogs.slice(0, 6) : dogs.slice(0, 3);
          const canExpand = !familiarExpanded && dogs.length > 3;

          return (
            <View style={s.section}>
              <Text style={s.sectionTitle}>자주 찾는 강아지</Text>

              {dogs.length === 0 ? (
                /* ── 빈 상태 ── */
                <View style={s.dogEmpty}>
                  <Icon name="paw" size={20} color={Colors.text.tertiary} />
                  <Text style={s.dogEmptyText}>
                    발도장이 쌓이면 익숙한 강아지들이 보일 수 있어요
                  </Text>
                </View>
              ) : (
                <>
                  {/* 강아지 행 — 가로 스크롤 없이 수평 wrap */}
                  <View style={s.dogRow}>
                    {visible.map(dog => (
                      <TouchableOpacity
                        key={dog.dog_id}
                        style={s.dogCard}
                        onPress={() => setSelectedDog(dog)}
                        activeOpacity={0.75}
                      >
                        <View style={s.dogAvatarWrap}>
                          {dog.avatar_url ? (
                            <Image source={{ uri: dog.avatar_url }} style={s.dogAvatarImg} resizeMode="cover" />
                          ) : (
                            <View style={s.dogAvatarPlaceholder}>
                              <Text style={s.dogAvatarInitial}>{dog.name[0]}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.dogName} numberOfLines={1}>{dog.name}</Text>
                        <Text style={s.dogBreed} numberOfLines={1}>{dog.breed_age_text}</Text>
                        <Text style={s.dogRecency} numberOfLines={2}>{dog.recency_label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* 더보기 버튼 (3마리 이상인 경우만) */}
                  {canExpand && (
                    <TouchableOpacity
                      style={s.dogExpandBtn}
                      onPress={() => setFamiliarExpanded(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.dogExpandText}>더 보기 ({dogs.length - 3}마리 더)</Text>
                      <Icon name="down" size={14} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          );
        })()}

      </ScrollView>

      {/* ── 자주 찾는 강아지 — 바텀시트 상세 레이어 ── */}
      <Modal
        visible={selectedDog !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDog(null)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setSelectedDog(null)}>
          <Pressable style={[s.sheetContainer, { paddingBottom: insets.bottom + Spacing[24] }]}
            onPress={e => e.stopPropagation()}
          >
            {/* 핸들 */}
            <View style={s.sheetHandle} />

            {/* 닫기 버튼 */}
            <TouchableOpacity style={s.sheetCloseBtn} onPress={() => setSelectedDog(null)}>
              <Icon name="close" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>

            {selectedDog && (
              <>
                {/* ── 아바타 + 이름 ── */}
                <View style={s.sheetAvatarWrap}>
                  {selectedDog.avatar_url ? (
                    <Image source={{ uri: selectedDog.avatar_url }} style={s.sheetAvatarImg} resizeMode="cover" />
                  ) : (
                    <View style={s.sheetAvatarPlaceholder}>
                      <Text style={s.sheetAvatarInitial}>{selectedDog.name[0]}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.sheetName}>{selectedDog.name}</Text>

                {/* ── 견종 / 몸집 정보 테이블 ── */}
                <View style={s.sheetInfoTable}>
                  {selectedDog.breed_text ? (
                    <>
                      <View style={s.sheetInfoRow}>
                        <Text style={s.sheetInfoKey}>견종</Text>
                        <Text style={s.sheetInfoVal}>{selectedDog.breed_text}</Text>
                      </View>
                      <View style={s.sheetInfoDivider} />
                    </>
                  ) : null}
                  <View style={s.sheetInfoRow}>
                    <Text style={s.sheetInfoKey}>몸집</Text>
                    <Text style={s.sheetInfoVal}>{selectedDog.size_label}</Text>
                  </View>
                  {selectedDog.temperament_preview.length > 0 && (
                    <>
                      <View style={s.sheetInfoDivider} />
                      <View style={s.sheetInfoRow}>
                        <Text style={s.sheetInfoKey}>성향</Text>
                        <View style={s.sheetTemperRow}>
                          {selectedDog.temperament_preview.map(t => (
                            <View key={t} style={s.sheetTemperChip}>
                              <Text style={s.sheetTemperText}>{t}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {/* ── 장소와의 관계 ── */}
                <View style={s.sheetRelationBox}>
                  <Icon name="paw" size={14} color={Colors.brand.primary} />
                  <Text style={s.sheetRelationText}>{selectedDog.relation_text}</Text>
                </View>

                {/* ── 완화된 최근성 ── */}
                <Text style={s.sheetRecency}>{selectedDog.recency_label}</Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* 네비 바 — ScrollView 이후에 렌더링해야 터치 이벤트가 최상단에서 잡힘 */}
      <View style={[s.heroNavFixed, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={s.heroNavBtn} onPress={() => router.back()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.heroNavRight}>
          <TouchableOpacity style={s.heroNavBtn} onPress={handleShare}>
            <Icon name="share" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.heroNavBtn} onPress={handleMore}>
            <Icon name="more" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 하단 고정 액션 바 ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <TouchableOpacity style={s.bottomBtnDirections} onPress={handleDirections} activeOpacity={0.85}>
          <Icon name="navigate" size={18} color={Colors.brand.primary} />
          <Text style={s.bottomBtnDirectionsText}>길찾기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bottomBtnPaw} onPress={handlePawCheckin} activeOpacity={0.88}>
          <Icon name="paw-filled" size={18} color="#fff" />
          <Text style={s.bottomBtnPawText}>발도장 남기기</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─────────────────────────────────────────
const HERO_H = 260;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  // ── 히어로 ────────────────────────────────────────────────────────
  heroWrap: {
    position: 'relative',
    backgroundColor: Colors.brand.subtle,
    overflow: 'hidden',
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.subtle,
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 160,
  },
  // 네비 바 — 화면 최상단에 absolute 고정 (스크롤 위에 떠 있음)
  heroNavFixed: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
  },
  heroNavBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  heroNavRight: { flexDirection: 'row' },

  heroBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing[16],
    paddingBottom: Spacing[16],
    gap: Spacing[6],
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing[8],
  },
  heroName: {
    flex: 1,
    ...Typography.display.s,
    color: '#FFFFFF',
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
  },
  heroMetaText: {
    ...Typography.label.s,
    color: 'rgba(255,255,255,0.90)',
  },
  // ── 스크롤 ───────────────────────────────────────────────────────
  scroll: { flex: 1 },

  // ── 현황 카드 ─────────────────────────────────────────────────────
  statusCard: {
    backgroundColor: Colors.surface.default,
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[20],
    paddingBottom: Spacing[20],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.default,
    gap: Spacing[16],
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.card,
    paddingVertical: Spacing[16],
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing[4],
  },
  statValue: {
    ...Typography.title.s,
    color: Colors.text.primary,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border.default,
  },

  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    paddingVertical: Spacing[14],
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  btnSaveFull: {
    // ctaRow 없이 단독 버튼으로 사용 시 전체 너비 채움
    alignSelf: 'stretch',
  },
  btnSaveActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.subtle,
  },
  btnSaveText: {
    ...Typography.label.m,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  btnSaveTextActive: { color: Colors.brand.primary },

  // ── 공통 섹션 래퍼 ───────────────────────────────────────────────
  section: {
    backgroundColor: Colors.surface.default,
    marginTop: Spacing[6],
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[20],
    paddingBottom: Spacing[20],
    gap: Spacing[14],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border.default,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...Typography.title.s,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  sectionMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionMoreText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },

  // ── 자주 찾는 강아지 ─────────────────────────────────────────────
  dogRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[10],
  },
  dogCard: {
    alignItems: 'center',
    gap: Spacing[4],
    width: 88,
    paddingVertical: Spacing[10],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.m,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  dogAvatarWrap: {
    width: 56, height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border.brand,
    marginBottom: Spacing[2],
  },
  dogAvatarImg: { width: '100%', height: '100%' },
  dogAvatarPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogAvatarInitial: {
    ...Typography.title.s,
    color: Colors.brand.accent,
    fontWeight: '700',
  },
  dogName: {
    ...Typography.label.m,
    color: Colors.text.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  dogBreed: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
  dogRecency: {
    ...Typography.caption,
    color: Colors.brand.accent,
    textAlign: 'center',
    lineHeight: 14,
  },
  // 더보기 버튼
  dogExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
    paddingVertical: Spacing[10],
  },
  dogExpandText: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  // 빈 상태
  dogEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[10],
    paddingVertical: Spacing[20],
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  dogEmptyText: {
    flex: 1,
    ...Typography.body.s,
    color: Colors.text.tertiary,
    lineHeight: 20,
  },

  // ── 바텀시트 (자주 찾는 강아지 상세 레이어) ──────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing[12],
    paddingHorizontal: Spacing[24],
    alignItems: 'center',
    gap: Spacing[8],
    minHeight: 300,
  },
  sheetHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.strong,
    marginBottom: Spacing[8],
  },
  sheetCloseBtn: {
    position: 'absolute',
    top: Spacing[16],
    right: Spacing[16],
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarWrap: {
    width: 80, height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: Colors.border.brand,
    marginTop: Spacing[8],
    marginBottom: Spacing[4],
  },
  sheetAvatarImg: { width: '100%', height: '100%' },
  sheetAvatarPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarInitial: {
    ...Typography.display.s,
    color: Colors.brand.accent,
    fontWeight: '700',
  },
  sheetName: {
    ...Typography.title.m,
    color: Colors.text.primary,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing[4],
  },

  // 견종·몸집·성향 정보 테이블
  sheetInfoTable: {
    alignSelf: 'stretch',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
    backgroundColor: Colors.bg.secondary,
    marginBottom: Spacing[4],
  },
  sheetInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[12],
    paddingHorizontal: Spacing[16],
    gap: Spacing[12],
  },
  sheetInfoDivider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginHorizontal: Spacing[16],
  },
  sheetInfoKey: {
    ...Typography.label.s,
    color: Colors.text.tertiary,
    width: 36,
    fontWeight: '500',
  },
  sheetInfoVal: {
    flex: 1,
    ...Typography.label.m,
    color: Colors.text.primary,
    fontWeight: '600',
  },

  // 성향 칩 (테이블 내부)
  sheetTemperRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing[6],
    flexWrap: 'wrap',
  },
  sheetTemperChip: {
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[10],
    paddingVertical: 4,
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.brand,
  },
  sheetTemperText: {
    ...Typography.label.s,
    color: Colors.brand.accent,
    fontWeight: '600',
  },

  // 장소 관계
  sheetRelationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[12],
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.brand,
    alignSelf: 'stretch',
  },
  sheetRelationText: {
    flex: 1,
    ...Typography.label.m,
    color: Colors.brand.accent,
    fontWeight: '600',
  },
  sheetRecency: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginBottom: Spacing[8],
  },

  // ── 흔적 리스트 ──────────────────────────────────────────────────
  traceList: {
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  traceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[12],
    paddingVertical: Spacing[14],
    paddingHorizontal: Spacing[16],
    backgroundColor: Colors.surface.default,
  },
  traceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  traceIconWrap: {
    width: 32, height: 32,
    borderRadius: 10,
    backgroundColor: Colors.brand.subtle,
    borderWidth: 1,
    borderColor: Colors.border.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  traceContent: { flex: 1, gap: Spacing[4] },
  traceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
  },
  traceTime: {
    ...Typography.label.s,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  traceTag: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[8],
    paddingVertical: 2,
    borderRadius: Radius.round,
  },
  traceTagText: { ...Typography.caption, color: Colors.text.secondary },
  tracePhotoLabel: { ...Typography.caption, color: Colors.brand.primary },
  traceNote: { ...Typography.caption, color: Colors.text.tertiary },
  traceThumb: {
    width: 44, height: 44,
    borderRadius: Radius.m,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noTrace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[10],
    padding: Spacing[24],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.card,
    justifyContent: 'center',
  },
  noTraceText: { ...Typography.body.s, color: Colors.text.tertiary },

  // ── 장소 정보 테이블 ─────────────────────────────────────────────
  infoTable: {
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing[14],
    paddingHorizontal: Spacing[16],
    gap: Spacing[16],
  },
  infoSep: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginHorizontal: Spacing[16],
  },
  infoKey: {
    ...Typography.label.m,
    color: Colors.text.tertiary,
    width: 56,
    flexShrink: 0,
  },
  infoVal: {
    flex: 1,
    ...Typography.label.m,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  featureChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[6],
  },
  featureChip: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: Spacing[10],
    paddingVertical: 4,
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  featureChipText: { ...Typography.label.s, color: Colors.text.secondary },

  // ── 하단 고정 액션 바 ──────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[12],
    gap: Spacing[10],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  bottomBtnDirections: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[8],
    paddingVertical: Spacing[14],
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  bottomBtnDirectionsText: {
    ...Typography.label.l,
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  bottomBtnPaw: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[8],
    paddingVertical: Spacing[14],
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
  },
  bottomBtnPawText: {
    ...Typography.label.l,
    color: '#fff',
    fontWeight: '800',
  },

  // 지도 placeholder
  mapPlaceholder: {
    height: 96,
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
  },
  mapPlaceholderText: {
    ...Typography.label.m,
    color: Colors.brand.accent,
    fontWeight: '600',
  },

});
