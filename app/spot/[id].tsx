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

import React, { useCallback, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { AppImage } from '../../src/components/common/AppImage';
import {
  View, Text, ScrollView, TouchableOpacity,
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

  const [selectedDog, setSelectedDog] = useState<FamiliarDogCardViewModel | null>(null);

  const handleSave = useCallback(() => toggleSaveSpot(id), [id, toggleSaveSpot]);
  const handleCopyAddress = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('복사됨', '주소를 클립보드에 복사했어요.');
    } catch {
      Alert.alert('복사 실패', '주소를 복사하지 못했어요.');
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
        { text: '정보 수정 제안', onPress: () => Alert.alert('준비 중', '정보 수정 제안 기능을 준비 중이에요.') },
        { text: '이 장소 신고하기', style: 'destructive', onPress: () => router.push({ pathname: '/report', params: { target_type: 'spot', target_id: id } } as any) },
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
            <AppImage
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

        {/* ── 현황 카드 (정보 전용, 터치 불가) ── */}
        <View style={s.statusCard}>
          <View style={s.statsRow}>
            {/* 방문한 강아지 — 첫 번째 */}
            <View style={s.statItem}>
              <Icon name="leaf" size={16} color={Colors.brand.primary} />
              <Text style={s.statValue}>{vm.unique_visitor_count}</Text>
              <Text style={s.statLabel}>방문한 강아지</Text>
            </View>
            <View style={s.statDivider} />
            {/* 최근 발도장 — 두 번째 */}
            <View style={s.statItem}>
              <Icon name="paw-filled" size={16} color={Colors.brand.primary} />
              <Text style={s.statValue}>{vm.recent_trace_count}</Text>
              <Text style={s.statLabel}>최근 발도장</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Icon name="star" size={16} color={Colors.brand.primary} />
              <Text style={s.statValue}>{vm.user_relation?.visit_count ?? 0}회</Text>
              <Text style={s.statLabel}>내 방문 횟수</Text>
            </View>
          </View>
        </View>

        {/* ── P2: 장소 정보 ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>장소 정보</Text>

          <View style={s.infoTable}>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>장소 유형</Text>
              <Text style={s.infoVal}>{vm.category_label}</Text>
            </View>
            {vm.features && vm.features.length > 0 && (
              <>
                <View style={s.infoSep} />
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>주요 태그</Text>
                  <View style={s.featureChips}>
                    {vm.features.map(f => (
                      <View key={f} style={s.featureChip}>
                        <Text style={s.featureChipText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}
            {vm.description && (
              <>
                <View style={s.infoSep} />
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
                      <Icon name="copy" size={14} color={Colors.brand.primary} />
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

      {/* 네비 바 — ScrollView 이후에 렌더링해야 터치 이벤트가 최상단에서 잡힘 */}
      <View style={[s.heroNavFixed, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={s.heroNavBtn} onPress={() => router.back()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.heroNavRight}>
          <TouchableOpacity style={s.heroNavBtn} onPress={handleShare}>
            <Icon name="share" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

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
    paddingVertical: Spacing[20],
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

  // ── 저장/발도장 2분할 CTA ─────────────────────────────────────────
  ctaRow: {
    flexDirection: 'row',
    gap: Spacing[10],
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[12],
    backgroundColor: Colors.surface.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.default,
  },
  btnSave: {
    flex: 1,
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
  btnPawInline: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.round,
    paddingVertical: Spacing[14],
  },
  btnPawInlineText: {
    ...Typography.label.m,
    color: '#fff',
    fontWeight: '700',
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

  // 주소 + 복사 버튼 — 한 줄 인라인
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
    lineHeight: 20,
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
  bottomBtnSaveActive: {
    backgroundColor: Colors.brand.subtle,
    borderColor: Colors.brand.primary,
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

