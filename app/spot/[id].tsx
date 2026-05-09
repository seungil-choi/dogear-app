/**
 * 장소 상세 — 풀 버전
 *
 * 레퍼런스 이미지 반영:
 *  - 히어로 이미지 위 장소명·거리·카테고리 오버레이
 *  - 현황 카드 (발도장수 / 분위기 / 태그) + 발도장·저장 CTA
 *  - 우리 보리와의 관계 (첫 방문 / 방문 횟수 / 최근 방문 / 단골 여부)
 *  - 자주 오는 강아지 (원형 아바타)
 *  - 최근 흔적 (사진 썸네일 포함)
 *  - 장소 정보 (유형·운영·특징·주의사항·주소 + 주소 복사)
 *  - 하단 CTA (저장 / 발도장 남기기)
 */

import React, { useCallback, useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { AppImage } from '../../src/components/common/AppImage';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking, Platform, Share, Modal, Pressable,
} from 'react-native';
import { notify, actionSheet } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Icon } from '../../src/components/common/Icon';
import KakaoMap, { type KakaoMarker } from '../../src/components/map/KakaoMap';
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

  // 장소 상세 진입 추적
  useEffect(() => {
    if (!vm) return;
    track(EVENT.place_detail_viewed, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm.category_label,
      region_sigungu: vm.neighborhood,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [selectedDog, setSelectedDog] = useState<FamiliarDogCardViewModel | null>(null);

  const handleSave = useCallback(() => {
    const wasSaved = vm?.is_saved;
    toggleSaveSpot(id);
    track(wasSaved ? EVENT.place_unsaved : EVENT.place_saved, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm?.category_label,
    });
  }, [id, toggleSaveSpot, vm]);
  const handleCopyAddress = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      notify('주소를 클립보드에 복사했어요.', '복사됨');
    } catch {
      notify('주소를 복사하지 못했어요.', '복사 실패');
    }
  }, []);

  const handlePawCheckin = useCallback(() => {
    const cards = getHomeCards();
    const card  = cards.find(c => c.spot_id === id);
    if (card) setPawSpot(card);
    router.push('/paw-checkin');
  }, [id, getHomeCards, setPawSpot, router]);

  const handleDirections = useCallback(() => {
    if (vm?.address_text) {
      track(EVENT.navigation_clicked, {
        screen_name: 'spot_detail',
        place_id: id,
        place_category: vm.category_label,
      });
      Linking.openURL(
        `https://map.naver.com/v5/search/${encodeURIComponent(vm.address_text)}`
      );
    }
  }, [vm, id]);

  const handleShare = useCallback(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share && vm) {
      (navigator as any).share({ title: vm.name, url: typeof window !== 'undefined' ? window.location.href : '' }).catch(() => {});
    } else if (vm) {
      Share.share({ title: vm.name, message: vm.name }).catch(() => {});
    }
  }, [vm]);

  const handleMore = useCallback(async () => {
    const idx = await actionSheet(vm?.name ?? '장소', [
      { label: '길찾기 (네이버 지도)' },
      { label: '정보 수정 제안' },
      { label: '이 장소 신고하기', destructive: true },
    ]);
    if (idx === 0) handleDirections();
    else if (idx === 1) router.push({ pathname: '/info-correction', params: { spot_id: id } });
    else if (idx === 2) router.push({ pathname: '/report', params: { target_type: 'spot', target_id: id } });
  }, [vm, id, router, handleDirections]);

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
          고정 상단 네비 바 (뒤로가기 · 공유 · 더보기)
          저장은 하단 CTA로 일원화 — 중복 노출 방지
      ════════════════════════════════════ */}
      <View style={[s.topNav, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={s.topNavBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="뒤로 가기"
        >
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={s.topNavRight}>
          <TouchableOpacity style={s.topNavBtn} onPress={handleShare} hitSlop={8} accessibilityLabel="공유">
            <Icon name="share" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.topNavBtn} onPress={handleMore} hitSlop={8} accessibilityLabel="더보기">
            <Icon name="more" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ════════════════════════════════════
          스크롤 본문
      ════════════════════════════════════ */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 상단 헤더: 한눈 요약 영역 ── */}
        <View style={s.spotHeader}>
          <View style={s.spotHeaderContent}>
            {/* 장소 유형 뱃지 */}
            <View style={s.categoryBadge}>
              <Icon name="leaf" size={11} color={Colors.brand.primary} />
              <Text style={s.categoryBadgeText}>{vm.category_label}</Text>
            </View>
            {/* 장소명 */}
            <Text style={s.spotName} numberOfLines={2}>{vm.name}</Text>
            {/* 지역 · 거리 */}
            <View style={s.spotMetaRow}>
              <Icon name="location" size={13} color={Colors.text.tertiary} />
              <Text style={s.spotMetaText} numberOfLines={1}>
                {[vm.region_summary, vm.distance_text].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          {/* 지도 썸네일 — 실제 위치 미니맵 (이미지 대체 식별 장치) */}
          <View style={s.mapThumb} pointerEvents="none">
            <KakaoMap
              initialLatitude={vm.latitude}
              initialLongitude={vm.longitude}
              initialLevel={4}
              markers={[{
                id: vm.spot_id,
                latitude: vm.latitude,
                longitude: vm.longitude,
                label: vm.name,
                variant: 'default',
              }] as KakaoMarker[]}
              style={{ flex: 1, borderRadius: Radius.card }}
            />
          </View>
        </View>

        {/* ── 관계 요약 카드 (아이콘으로 판독성 강화) ── */}
        <View style={s.statsCard}>
          <View style={s.statItem}>
            <View style={s.statIconWrap}>
              <Icon name="leaf-filled" size={16} color={Colors.brand.primary} />
            </View>
            <Text style={s.statValue}>{vm.unique_visitor_count}</Text>
            <Text style={s.statLabel}>방문한 강아지</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <View style={s.statIconWrap}>
              <Icon name="paw-filled" size={16} color={Colors.brand.primary} />
            </View>
            <Text style={s.statValue}>{vm.recent_trace_count}</Text>
            <Text style={s.statLabel}>최근 발도장</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <View style={s.statIconWrap}>
              <Icon name="star-filled" size={16} color={Colors.brand.primary} />
            </View>
            <Text style={s.statValue}>{vm.user_relation?.visit_count ?? 0}회</Text>
            <Text style={s.statLabel}>내 방문</Text>
          </View>
        </View>

        {/* ── 장소 정보 섹션 (라벨/값 테이블 구조) ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>장소 정보</Text>

          <View style={s.infoTable}>
            {vm.features && vm.features.length > 0 && (
              <View style={s.infoRow}>
                <Text style={s.infoKey}>주요 태그</Text>
                <View style={s.featureChips}>
                  {vm.features.slice(0, 6).map(f => (
                    <View key={f} style={s.featureChip}>
                      <Text style={s.featureChipText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {vm.description && (
              <>
                {vm.features && vm.features.length > 0 && <View style={s.infoSep} />}
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>설명</Text>
                  <Text style={s.infoVal}>{vm.description}</Text>
                </View>
              </>
            )}
            {vm.address_text && (
              <>
                <View style={s.infoSep} />
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>주소</Text>
                  <View style={s.infoAddressRow}>
                    <Text style={s.infoAddressText}>{vm.address_text}</Text>
                    <TouchableOpacity
                      style={s.copyAddrBtn}
                      onPress={() => handleCopyAddress(vm.address_text!)}
                      activeOpacity={0.75}
                      accessibilityLabel="주소 복사"
                      hitSlop={6}
                    >
                      <Icon name="copy" size={13} color={Colors.brand.primary} />
                      <Text style={s.copyAddrLabel}>복사</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── P3: 자주 찾는 강아지 ── */}
        {(() => {
          const dogs = vm.familiar_dogs;
          return (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>자주 찾는 강아지</Text>
              </View>
              {dogs.length === 0 ? (
                <Text style={s.familiarEmptyText}>
                  발도장이 쌓이면 익숙한 강아지들이 보일 수 있어요
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.familiarRail}
                >
                  {dogs.map(dog => (
                    <TouchableOpacity
                      key={dog.dog_id}
                      style={s.familiarCell}
                      onPress={() => setSelectedDog(dog)}
                      activeOpacity={0.72}
                    >
                      <View style={s.familiarAvatarWrap}>
                        {dog.avatar_url ? (
                          <AppImage source={{ uri: dog.avatar_url }} style={s.familiarAvatarImg} resizeMode="cover" />
                        ) : (
                          <View style={s.familiarAvatarPlaceholder}>
                            <Text style={s.familiarAvatarInitial}>{dog.name[0]}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.familiarName} numberOfLines={1}>{dog.name}</Text>
                      <Text style={s.familiarRecency} numberOfLines={2}>{dog.recency_label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          );
        })()}

        {/* ── P3: 최근 흔적 ── */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>최근 흔적</Text>
            <TouchableOpacity style={s.sectionMore} onPress={() => router.push(`/visit-history/${id}`)}>
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
                  onPress={() => router.push(`/visit-history/${id}`)}
                >
                  <View style={s.traceIconWrap}>
                    <Icon name="paw-filled" size={14} color={Colors.brand.primary} />
                  </View>
                  <View style={s.traceContent}>
                    <View style={s.traceTopRow}>
                      <Text style={s.traceTime}>{trace.relative_time_text}</Text>
                      {trace.primary_tag_label ? (
                        <View style={s.traceTag}>
                          <Text style={s.traceTagText}>{trace.primary_tag_label}</Text>
                        </View>
                      ) : null}
                    </View>
                    {trace.secondary_text && (
                      <Text style={s.traceNote} numberOfLines={1}>{trace.secondary_text}</Text>
                    )}
                    {/* Phase 2: 사진 라벨 — 사진 기능 구현 후 노출
                    {trace.photo_count != null && trace.photo_count > 0 && (
                      <Text style={s.tracePhotoLabel}>사진 {trace.photo_count}장</Text>
                    )}
                    */}
                  </View>
                  {/* Phase 2: 사진 썸네일 — 사진 업로드/표시 기능 구현 후 활성화
                  {trace.has_photo && (
                    <View style={s.traceThumb}>
                      <Icon name="camera" size={16} color={Colors.text.tertiary} />
                    </View>
                  )}
                  */}
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

      </ScrollView>

      {/* ── 자주 찾는 강아지 — 바텀시트 상세 레이어 ── */}
      <Modal
        visible={selectedDog !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDog(null)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setSelectedDog(null)}>
          <Pressable
            style={[s.sheetContainer, { paddingBottom: insets.bottom + Spacing[28] }]}
            onPress={e => e.stopPropagation()}
          >
            {/* 핸들 */}
            <View style={s.sheetHandle} />

            {selectedDog && (() => {
              const infoRows: { key: string; val: string }[] = [];
              if (selectedDog.breed_text)  infoRows.push({ key: '견종', val: selectedDog.breed_text });
              if (selectedDog.size_label)  infoRows.push({ key: '몸집', val: selectedDog.size_label });

              return (
                <>
                  {/* ── 아바타 + 이름 (중앙 정렬) ── */}
                  <View style={s.sheetHero}>
                    <View style={s.sheetAvatarWrap}>
                      {selectedDog.avatar_url ? (
                        <AppImage source={{ uri: selectedDog.avatar_url }} style={s.sheetAvatarImg} resizeMode="cover" />
                      ) : (
                        <View style={s.sheetAvatarPlaceholder}>
                          <Text style={s.sheetAvatarInitial}>{selectedDog.name[0]}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.sheetName}>{selectedDog.name}</Text>
                    {/* 견종 · 몸집 한 줄 서브텍스트 */}
                    {selectedDog.breed_age_text ? (
                      <Text style={s.sheetSubLine}>{selectedDog.breed_age_text}</Text>
                    ) : null}
                  </View>

                  {/* ── 성향 칩 ── */}
                  {selectedDog.temperament_preview.length > 0 && (
                    <View style={s.sheetChipRow}>
                      {selectedDog.temperament_preview.map(t => (
                        <View key={t} style={s.sheetChip}>
                          <Text style={s.sheetChipText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* ── 프로필 정보 테이블 ── */}
                  {infoRows.length > 0 && (
                    <View style={s.sheetInfoTable}>
                      {infoRows.map((row, i) => (
                        <React.Fragment key={row.key}>
                          {i > 0 && <View style={s.sheetInfoSep} />}
                          <View style={s.sheetInfoRow}>
                            <Text style={s.sheetInfoKey}>{row.key}</Text>
                            <Text style={s.sheetInfoVal}>{row.val}</Text>
                          </View>
                        </React.Fragment>
                      ))}
                    </View>
                  )}

                  {/* ── 구분선 ── */}
                  <View style={s.sheetDivider} />

                  {/* ── 장소 관계 + 최근성 ── */}
                  <View style={s.sheetFooter}>
                    <Text style={s.sheetRelation}>{selectedDog.relation_text}</Text>
                    <Text style={s.sheetRecency}>{selectedDog.recency_label}</Text>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 하단 고정 액션 바 — 저장 + 발도장 ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <TouchableOpacity
          style={[s.bottomBtnDirections, vm.is_saved && s.bottomBtnSaveActive]}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Icon
            name={vm.is_saved ? 'bookmark-filled' : 'bookmark'}
            size={18}
            color={Colors.brand.primary}
          />
          <Text style={s.bottomBtnDirectionsText}>
            {vm.is_saved ? '저장됨' : '저장하기'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bottomBtnPaw} onPress={handlePawCheckin} activeOpacity={0.88}>
          <Icon name="paw-filled" size={18} color="#fff" />
          <Text style={s.bottomBtnPawText}>발도장 남기기</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  // ── 상단 네비 바 (고정) ───────────────────────────────────────────
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[4],
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.subtle,
  },
  topNavBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 22,
  },
  topNavRight: { flexDirection: 'row' },

  // ── 스크롤 ───────────────────────────────────────────────────────
  scroll: { flex: 1 },

  // ── 상단 헤더: 한눈 요약 영역 (compact) ────────────────────────────
  spotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[14],
    paddingBottom: Spacing[14],
    backgroundColor: Colors.bg.primary,
    gap: Spacing[12],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.subtle,
  },
  spotHeaderContent: {
    flex: 1,
    gap: Spacing[4],
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    alignSelf: 'flex-start',
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[8],
    paddingVertical: 2,
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.brand,
  },
  categoryBadgeText: {
    ...Typography.caption,
    color: Colors.brand.primary,
    fontWeight: '600',
  },
  spotName: {
    ...Typography.title.l,
    color: Colors.text.primary,
    fontWeight: '800',
    lineHeight: 26,
    marginTop: 2,
  },
  spotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  spotMetaText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },

  // 지도 썸네일 — 컴팩트 미니맵
  mapThumb: {
    width: 88, height: 88,
    borderRadius: Radius.card,
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
    flexShrink: 0,
  },

  // ── 관계 요약 카드 (아이콘 포함) ───────────────────────────────────
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    paddingVertical: Spacing[16],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.subtle,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing[4],
  },
  statIconWrap: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
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
    height: 56,
    backgroundColor: Colors.border.default,
  },

  // ── 공통 섹션 래퍼 ───────────────────────────────────────────────
  section: {
    backgroundColor: Colors.surface.default,
    paddingHorizontal: Spacing[16],
    paddingTop: Spacing[20],
    paddingBottom: Spacing[20],
    gap: Spacing[14],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.default,
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

  // ── 자주 찾는 강아지 — 가로 스크롤 레일 ───────────────────────────
  familiarRail: {
    gap: Spacing[20],
    paddingVertical: Spacing[4],
  },
  familiarCell: {
    alignItems: 'center',
    gap: Spacing[6],
    width: 80,
  },
  familiarAvatarWrap: {
    width: 52, height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: Colors.bg.secondary,
  },
  familiarAvatarImg: { width: '100%', height: '100%' },
  familiarAvatarPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  familiarAvatarInitial: {
    ...Typography.title.s,
    color: Colors.brand.accent,
    fontWeight: '700',
  },
  familiarName: {
    ...Typography.label.s,
    color: Colors.text.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  familiarRecency: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 15,
  },
  // 빈 상태
  familiarEmptyText: {
    ...Typography.body.s,
    color: Colors.text.tertiary,
    paddingVertical: Spacing[8],
  },

  // ── 바텀시트 (자주 찾는 강아지 프로필 레이어) ───────────────────
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
    gap: Spacing[16],
  },
  sheetHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.strong,
    marginBottom: Spacing[4],
    alignSelf: 'center',
  },

  // 아바타 + 이름 중앙 정렬
  sheetHero: {
    alignItems: 'center',
    gap: Spacing[8],
    paddingTop: Spacing[4],
  },
  sheetAvatarWrap: {
    width: 72, height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: Colors.bg.secondary,
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  sheetAvatarImg: { width: '100%', height: '100%' },
  sheetAvatarPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarInitial: {
    ...Typography.title.m,
    color: Colors.brand.accent,
    fontWeight: '700',
  },
  sheetName: {
    ...Typography.title.m,
    color: Colors.text.primary,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetSubLine: {
    ...Typography.body.s,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },

  // 성향 칩 행
  sheetChipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing[8],
  },
  sheetChip: {
    backgroundColor: Colors.brand.subtle,
    paddingHorizontal: Spacing[12],
    paddingVertical: Spacing[6],
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.brand,
  },
  sheetChipText: {
    ...Typography.label.s,
    color: Colors.brand.accent,
    fontWeight: '600',
  },

  // 정보 테이블
  sheetInfoTable: {
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
    backgroundColor: Colors.bg.secondary,
  },
  sheetInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[12],
    paddingHorizontal: Spacing[16],
    gap: Spacing[12],
  },
  sheetInfoSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.default,
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

  // 구분선
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.subtle,
  },

  // 장소 관계 + 최근성
  sheetFooter: {
    gap: Spacing[4],
    paddingBottom: Spacing[4],
  },
  sheetRelation: {
    ...Typography.body.s,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  sheetRecency: {
    ...Typography.caption,
    color: Colors.text.tertiary,
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

  // ── 장소 정보 테이블 (좌:라벨 / 우:값) ─────────────────────────
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
    lineHeight: 22,
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

  // 주소 + 복사 — 한 줄 인라인 (테이블 내)
  infoAddressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[10],
  },
  infoAddressText: {
    flex: 1,
    ...Typography.label.m,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  copyAddrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[8],
    paddingVertical: 4,
    borderRadius: Radius.s,
    backgroundColor: Colors.brand.subtle,
    flexShrink: 0,
  },
  copyAddrLabel: {
    ...Typography.label.s,
    color: Colors.brand.primary,
    fontWeight: '600',
  },

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
    gap: Spacing[6],
    paddingVertical: Spacing[14],
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  bottomBtnSaveActive: {
    backgroundColor: Colors.brand.subtle,
    borderColor: Colors.brand.primary,
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

});

