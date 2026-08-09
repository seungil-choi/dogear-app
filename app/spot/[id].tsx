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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { AppImage } from '../../src/components/common/AppImage';
import { SpotKeyVisual } from '../../src/components/spot/SpotKeyVisual';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking, Platform, Share, Modal, Pressable,
} from 'react-native';
import { notify, actionSheet, confirm } from '../../src/utils/dialog';
import { track, EVENT } from '../../src/utils/analytics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { useSpotDetail } from '../../src/hooks/useSpotDetail';
import { buildSpotDetailFromApi } from '../../src/utils/rules';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Icon } from '../../src/components/common/Icon';
import { facilityChips } from '../../src/constants/facilityTags';
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
  const spots          = useAppStore(s => s.spots);
  const currentLocation = useAppStore(s => s.currentLocation);
  const dog            = useAppStore(s => s.dog);
  const savedSpots     = useAppStore(s => s.savedSpots); // 저장 토글 시 즉시 리렌더

  // 서버(spot-detail Edge Function)가 전체 강아지 기준으로 계산한 상세를 우선 사용.
  // 도착 전/실패/데모(DEV_SEED)에는 로컬 getSpotDetail로 폴백 — 분위기·흔적·익숙한 강아지가
  // 내 강아지 데이터로만 계산되던 정합성 문제를 실모드에서 해소.
  const serverDetail = useSpotDetail(id);
  const localVm = getSpotDetail(id);
  const vm = useMemo(() => {
    if (serverDetail.data) {
      return buildSpotDetailFromApi(serverDetail.data, {
        currentLocation,
        storeSpot: spots.find(sp => sp.spot_id === id),
      });
    }
    return localVm;
  }, [serverDetail.data, localVm, currentLocation, spots, id]);

  // 발도장을 마치고 이 화면으로 돌아왔을 때 서버 집계를 다시 읽는다.
  //   상단 세 숫자(다녀간 강아지 / 발도장 / 내 방문)는 전부 spot-detail 스냅샷이라
  //   재조회가 없으면 방금 남긴 발도장이 반영되지 않는다 — "찍혔나?" 싶은 화면이 된다.
  //   (발도장 완료가 홈으로 튕기던 시절엔 이 화면으로 돌아올 일이 없어 드러나지 않았다)
  //   isLoading은 화면에서 쓰지 않고 데이터가 있으면 그대로 그리므로 깜빡임은 없다.
  //   첫 포커스는 마운트 시 이미 조회가 돌았으므로 건너뛴다.
  const hasFocusedOnceRef = useRef(false);
  const refreshDetail = serverDetail.refresh;
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      refreshDetail();
    }, [refreshDetail]),
  );

  // 저장 상태는 서버 스냅샷(vm.is_saved)이 아니라 로컬 savedSpots로 판단 — 탭 즉시 반영.
  const locallySaved = useMemo(
    () => (dog ? savedSpots.some(sv => sv.spot_id === id && sv.dog_id === dog.dog_id) : false),
    [savedSpots, dog, id],
  );

  // 화면에 보여줄 저장 수 — 서버 집계는 탭해도 즉시 갱신되지 않는다.
  //   서버 스냅샷(vm.is_saved)과 로컬 상태가 갈린 만큼만 ±1 보정해,
  //   저장하자마자 숫자가 그대로 멈춰 있는 어색함을 없앤다.
  const displaySavedCount = useMemo(() => {
    if (!vm) return 0;
    const delta = locallySaved === !!vm.is_saved ? 0 : (locallySaved ? 1 : -1);
    return Math.max(0, (vm.saved_count ?? 0) + delta);
  }, [vm, locallySaved]);

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
    // 강아지 미등록 사용자는 저장 불가(dog_id 필요) — 조용한 무반응 대신 등록 유도
    if (!dog) {
      confirm('강아지를 등록하면 마음에 든 장소를 저장할 수 있어요.', {
        title: '강아지 등록이 필요해요',
        confirmText: '등록하러 가기',
      }).then(ok => { if (ok) router.push('/(auth)/dog-setup'); });
      return;
    }
    // 서버 스냅샷(vm.is_saved)은 탭해도 갱신되지 않는다. 그걸로 판단하면
    // 저장 직후 해제할 때도 place_saved가 찍혀 계측이 어긋난다 → 로컬 상태로 판단.
    toggleSaveSpot(id);
    track(locallySaved ? EVENT.place_unsaved : EVENT.place_saved, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm?.category_label,
    });
  }, [id, toggleSaveSpot, vm, dog, router, locallySaved]);
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

  /**
   * 외부 지도 앱으로 길찾기.
   *
   * 예전엔 주소 문자열로 map.naver.com/v5/search/… 를 열었다. 그 경로는 네이버가
   * 접은 URL이고, 주소가 비어 있으면 아무 일도 하지 않고 조용히 끝났다.
   * 좌표는 spots에 not null이라 항상 있다 — 카카오맵 link API로 좌표를 넘긴다.
   * (앱이 깔려 있으면 앱으로, 없으면 웹으로 열린다)
   * 열지 못하면 알린다. 눌렀는데 아무 반응 없는 게 제일 나쁘다.
   */
  const handleDirections = useCallback(async () => {
    if (!vm) return;
    track(EVENT.navigation_clicked, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm.category_label,
    });
    const url =
      `https://map.kakao.com/link/to/${encodeURIComponent(vm.name)},${vm.latitude},${vm.longitude}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.error('[spot] 길찾기 실행 실패:', e);
      notify('지도 앱을 열지 못했어요. 주소를 복사해 사용해주세요.', '길찾기 실패');
    }
  }, [vm, id]);

  /**
   * 장소 공유.
   *
   * 예전에는 장소 **이름만** 보냈다("망원한강공원"). 받는 사람은 그게 어디인지 알 수 없다.
   * 지금은 이름·카테고리·주소에 지도 링크까지 실어, 앱이 없어도 바로 열어볼 수 있게 한다.
   *
   * ⚠️ OG 미리보기(썸네일 카드)는 지금 구조에서 불가능하다.
   *    장소마다 크롤러가 읽을 수 있는 공개 웹 페이지가 있어야 하는데 그런 페이지가 없다.
   *    앱 스킴(dogear://)은 미리보기가 뜨지 않고 앱이 깔린 기기에서만 열린다.
   *    제대로 하려면 장소별 SSR 랜딩 + Universal/App Links가 선행돼야 한다.
   */
  const handleShare = useCallback(() => {
    if (!vm) return;
    const mapUrl = vm.address_text
      ? `https://map.naver.com/v5/search/${encodeURIComponent(vm.address_text)}`
      : `https://map.naver.com/v5/search/${encodeURIComponent(vm.name)}`;
    const lines = [
      `🐾 ${vm.name}`,
      [vm.category_label, vm.region_summary].filter(Boolean).join(' · '),
      vm.address_text ?? '',
      '',
      mapUrl,
    ].filter(l => l !== undefined);
    const message = lines.join('\n').replace(/\n{3,}/g, '\n\n');

    track(EVENT.place_shared, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm.category_label,
    });

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
      (navigator as any).share({ title: vm.name, text: message, url: mapUrl }).catch(() => {});
      return;
    }
    Share.share({ title: vm.name, message }).catch(() => {});
  }, [vm, id]);

  // 타인 강아지(익숙한 강아지) 신고/차단 — Apple UGC 1.2: 콘텐츠가 보이는 자리에서 신고·차단
  const handleReportDog = useCallback(async (dog: FamiliarDogCardViewModel) => {
    const idx = await actionSheet(dog.name, [
      { label: '이 강아지 신고하기', destructive: true },
      { label: '이 사용자 차단하기', destructive: true },
    ]);
    if (idx === 0 || idx === 1) {
      setSelectedDog(null);
      router.push({
        pathname: '/report',
        params: {
          target_type: 'dog',
          target_id: dog.dog_id,
          dog_id: dog.dog_id,
          dog_name: dog.name,
          dog_avatar_url: dog.avatar_url ?? '',
        },
      });
    }
  }, [router]);

  // 타인 흔적(메모/사진) 신고 — Apple UGC 1.2
  const handleReportTrace = useCallback(async (traceId: string) => {
    const idx = await actionSheet('이 흔적', [
      { label: '이 흔적 신고하기', destructive: true },
    ]);
    if (idx === 0) {
      router.push({ pathname: '/report', params: { target_type: 'checkin', target_id: traceId } });
    }
  }, [router]);

  // ⋯ 메뉴. 항목 수 제한이 없다 — 자체 액션시트로 옮겼기 때문.
  //   (예전엔 OS Alert을 썼는데 안드로이드는 버튼 3개까지라 4번째인 '취소'가 잘려나가
  //    한번 열면 닫을 수 없었다)
  const handleMore = useCallback(async () => {
    const idx = await actionSheet(vm?.name ?? '장소', [
      { label: '공유하기' },
      { label: '길찾기 (네이버 지도)' },
      { label: '정보 수정 제안' },
      { label: '이 장소 신고하기', destructive: true },
    ]);
    if (idx === 0) handleShare();
    else if (idx === 1) handleDirections();
    else if (idx === 2) router.push({ pathname: '/info-correction', params: { spot_id: id } });
    else if (idx === 3) router.push({ pathname: '/report', params: { target_type: 'spot', target_id: id } });
  }, [vm, id, router, handleDirections, handleShare]);

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
        {/* ── 키비주얼 헤더 ──
            홈 '오늘의 추천' 카드와 같은 컴포넌트다. 스크림 농도·여백·저장 표시가
            화면마다 갈라지지 않도록 한 곳에서만 그린다. */}
        <SpotKeyVisual
          height={260}
          name={vm.name}
          categoryLabel={vm.category_label}
          subcategory={vm.subcategory}
          coverImageUrl={vm.cover_image_url}
          metaText={[vm.region_summary, vm.distance_text].filter(Boolean).join(' · ')}
          savedCount={displaySavedCount}
          saved={locallySaved}
          onSave={handleSave}
          topRight={
            /* 검토 대기 — 장소를 설명하는 정보가 아니라 상태 표시라
               이름·카테고리와 같은 줄에 둘 이유가 없다. */
            vm.is_pending_review ? (
              <View style={s.keyVisualPendingChip}>
                <Icon name="info" size={11} color="#fff" />
                <Text style={s.keyVisualPendingText}>검토 중</Text>
              </View>
            ) : undefined
          }
        />

        {/* ── 관계 요약 카드 (아이콘으로 판독성 강화) ── */}
        <View style={s.statsCard}>
          <View style={s.statItem}>
            <View style={s.statIconWrap}>
              <Icon name="leaf-filled" size={16} color={Colors.brand.primary} />
            </View>
            {/* 예전에는 여기에 '최근 발도장 수'가 그대로 들어가 옆 칸과 항상 같은 숫자였다.
                이제 서버가 계산한 '서로 다른 강아지 수'가 들어간다. */}
            <Text style={s.statValue}>{vm.unique_visitor_count}</Text>
            <Text style={s.statLabel}>다녀간 강아지</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <View style={s.statIconWrap}>
              <Icon name="paw-filled" size={16} color={Colors.brand.primary} />
            </View>
            <Text style={s.statValue}>{vm.total_checkin_count}</Text>
            <Text style={s.statLabel}>발도장</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <View style={s.statIconWrap}>
              <Icon name="walk" size={16} color={Colors.brand.primary} />
            </View>
            <Text style={s.statValue}>{vm.user_relation?.visit_count ?? 0}회</Text>
            <Text style={s.statLabel}>내 방문</Text>
          </View>
        </View>

        {/* ── 장소 정보 섹션 (라벨/값 테이블 구조) ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>장소 정보</Text>

          {(() => {
            // 원본 시설명(조합놀이대·그네…)을 견주 판단 기준으로 번역해 보여준다.
            // 서버가 준 facility_tags가 우선, 없으면 store의 features(사용자 제안 태그).
            const chips = facilityChips(
              vm.facility_tags && vm.facility_tags.length > 0 ? vm.facility_tags : vm.features,
            );
            const hasChips = chips.length > 0;
            return (
          <View style={s.infoTable}>
            {hasChips && (
              <View style={s.infoRow}>
                <Text style={s.infoKey}>편의시설</Text>
                <View style={s.facilityWrap}>
                  {chips.map(c => (
                    <View key={c.key} style={s.facilityChip}>
                      <Icon name={c.icon} size={11} color={Colors.text.tertiary} />
                      <Text style={s.facilityChipText}>{c.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {vm.description && (
              <>
                {hasChips && <View style={s.infoSep} />}
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
            );
          })()}

          {/* 위치 미니맵 — 보기 전용.
              예전엔 지도 위에 투명 Touchable을 얹어 탭을 받으려 했는데,
              안드로이드에서 네이티브 WebView가 터치를 먹어 눌러도 아무 일이 없었다
              (부모 View의 pointerEvents='none'은 WebView 자식에 확실히 전파되지 않는다).
              지도는 그림으로 두고, 실제 동작은 WebView와 겹치지 않는 아래 버튼이 받는다. */}
          <View style={s.locationMap} pointerEvents="none">
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

          <TouchableOpacity
            style={s.mapActionBtn}
            onPress={handleDirections}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${vm.name} 길찾기`}
          >
            <Icon name="navigate" size={15} color={Colors.brand.primary} />
            <Text style={s.mapActionText}>지도 앱으로 길찾기</Text>
          </TouchableOpacity>
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
                  onLongPress={() => handleReportTrace(trace.trace_id)}
                  delayLongPress={400}
                  accessibilityHint="길게 누르면 이 흔적을 신고할 수 있어요"
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

                  {/* ── 신고/차단 (Apple UGC 1.2) ── */}
                  <TouchableOpacity
                    style={s.sheetReportBtn}
                    onPress={() => handleReportDog(selectedDog)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${selectedDog.name} 신고 또는 차단`}
                  >
                    <Icon name="flag" size={15} color={Colors.text.tertiary} />
                    <Text style={s.sheetReportText}>신고·차단</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 하단 고정 액션 바 — 저장 + 발도장 ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + Spacing[8] }]}>
        <TouchableOpacity
          style={[s.bottomBtnDirections, locallySaved && s.bottomBtnSaveActive]}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Icon
            name={locallySaved ? 'bookmark-filled' : 'bookmark'}
            size={18}
            color={Colors.brand.primary}
          />
          <Text style={s.bottomBtnDirectionsText}>
            {locallySaved ? '저장됨' : '저장하기'}
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

  // ── 키비주얼 헤더 ────────────────────────
  // 이미지·스크림·오버레이·저장은 SpotKeyVisual(홈 추천 카드와 공용)이 그린다.
  // 여기 남는 건 이 화면에만 있는 '검토 중' 칩뿐이다.
  //   위치는 SpotKeyVisual의 topRight 슬롯이 잡으므로 여기선 모양만 정한다.
  keyVisualPendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[8],
    paddingVertical: 3,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  keyVisualPendingText: {
    ...Typography.label.s,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // 길찾기 버튼 — 미니맵 아래. WebView와 겹치지 않아야 탭이 들어온다.
  mapActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing[6],
    height: 44,
    marginTop: Spacing[8],
    borderRadius: Radius.round,
    borderWidth: 1,
    borderColor: Colors.border.brand,
    backgroundColor: Colors.brand.subtle,
  },
  mapActionText: { ...Typography.label.l, color: Colors.brand.accent, fontWeight: '700' },

  locationMap: {
    width: '100%',
    height: 180,
    marginTop: Spacing[12],
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.bg.tertiary,
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
  // 편의시설 칩 — info(중립) / caution(주의) 두 톤
  facilityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[6],
    flex: 1,
  },
  facilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[10],
    paddingVertical: 4,
    borderRadius: Radius.round,
    borderWidth: 1,
    backgroundColor: Colors.bg.secondary,
    borderColor: Colors.border.default,
  },
  facilityChipText: { ...Typography.label.s, color: Colors.text.secondary },
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
  sheetReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    marginTop: Spacing[16],
    paddingVertical: Spacing[10],
  },
  sheetReportText: {
    ...Typography.label.m,
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

