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
  StyleSheet, Linking, Platform, Share, Modal, Pressable, Animated,
} from 'react-native';
import { actionSheet, confirm } from '../../src/utils/dialog';
import { toast } from '../../src/utils/toast';
import { PHOTO } from '../../src/constants/messages';
import { track, EVENT } from '../../src/utils/analytics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { useSpotDetail } from '../../src/hooks/useSpotDetail';
import { buildSpotDetailFromApi, displaySavedCount, softenedRecencyLabel } from '../../src/utils/rules';
import { EmptyState } from '../../src/components/common/EmptyState';
import { Icon } from '../../src/components/common/Icon';
import { categoryLabel as catLabel, feelingTagLabel } from '../../src/utils/labels';
import { facilityChips } from '../../src/constants/facilityTags';
import KakaoMap, { type KakaoMarker } from '../../src/components/map/KakaoMap';
import type { SpotVisitingDog, FamiliarDogCardViewModel, SpotGalleryPhoto, FeelingTag } from '../../src/types';
import { supabase } from '../../src/lib/supabase';

/** 키비주얼 높이. 상단 바가 장소명을 넘겨받는 스크롤 지점도 이 값에서 계산한다. */
const KEY_VISUAL_HEIGHT = 260;
/** 다녀간 강아지 레일에 처음 보이는 수 */
const DOG_RAIL_LIMIT = 8;

export default function SpotDetailScreen() {
  // 레일에 처음 보일 강아지 수. 넘치면 '더보기'로 그리드로 펼친다.
  const [expandDogs, setExpandDogs] = useState(false);
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

  // ── 상단 바 장소명 — 키비주얼이 화면 밖으로 밀려난 뒤에만 나타난다 ──
  //   상시 노출은 바로 아래 키비주얼의 큰 장소명과 같은 정보가 두 번 나오는 것이라 안 한다.
  //   반대로 스크롤을 내리면 장소명이 완전히 사라져 "지금 뭘 보고 있더라"가 되므로,
  //   그 시점에만 상단 바가 이름을 넘겨받는다.
  const scrollY = useRef(new Animated.Value(0)).current;
  // 키비주얼 높이 260 중 장소명은 아래쪽(대략 200~240)에 있다. 이름이 가려지기 시작할 때 받는다.
  const navTitleOpacity = scrollY.interpolate({
    inputRange: [KEY_VISUAL_HEIGHT - 100, KEY_VISUAL_HEIGHT - 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // 화면에 보여줄 저장 수 — 홈 추천 카드와 같은 함수를 쓴다(둘이 다른 숫자를 보이면 안 된다).
  const shownSavedCount = useMemo(
    () => (vm ? displaySavedCount(vm.saved_count ?? 0, !!vm.is_saved, locallySaved) : 0),
    [vm, locallySaved],
  );

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

  /**
   * 다녀간 강아지 탭 → 상세 시트.
   *
   * 이 시트가 **타인 강아지 신고·차단의 유일한 경로**다(Apple UGC 1.2 — 콘텐츠가 보이는
   * 자리에서 신고·차단할 수 있어야 한다). 그래서 탭을 막아두면 안 된다.
   *
   * 익숙한 강아지로도 잡혀 있으면 견종·성향까지 있는 풍부한 카드를 그대로 쓰고,
   * 아니면 서버가 준 최소 정보(이름·아바타·방문수)로 시트를 채운다.
   */
  const handleVisitingDogPress = useCallback((dog: SpotVisitingDog) => {
    if (dog.is_mine) { router.push('/dog-detail' as any); return; }
    const rich = vm?.familiar_dogs?.find(f => f.dog_id === dog.dog_id);
    setSelectedDog(rich ?? {
      dog_id: dog.dog_id,
      name: dog.name,
      avatar_url: dog.avatar_url ?? undefined,
      breed_text: '',
      size_label: '',
      breed_age_text: '',
      temperament_preview: [],
      // 폴백에서도 횟수를 그대로 쓰지 않는다 — familiar_dogs 경로와 같은 규칙을 탄다
      recency_label: softenedRecencyLabel(dog.visit_count, dog.last_visit_at),
      relation_text: dog.is_regular ? '이 장소의 단골이에요' : '이 장소에 다녀갔어요',
    });
  }, [vm, router]);

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
  /** 전화 걸기. tel: 스킴을 못 여는 기기(태블릿 등)에서는 조용히 실패하지 않게 알린다. */
  const handleCall = useCallback(async (phone: string) => {
    const url = `tel:${phone.replace(/[^0-9+]/g, '')}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.error('[spot] 전화 걸기 실패:', e);
      toast.error('이 기기로는 전화를 걸 수 없어요. 번호를 길게 눌러 복사해주세요');
    }
  }, []);

  const handleCopyAddress = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      toast.success('주소를 복사했어요');
    } catch {
      toast.error('주소를 복사하지 못했어요');
    }
  }, []);

  const handlePawCheckin = useCallback(() => {
    const cards = getHomeCards();
    const card  = cards.find(c => c.spot_id === id);
    if (card) setPawSpot(card);
    router.push('/paw-checkin');
  }, [id, getHomeCards, setPawSpot, router]);

  /**
   * 선택한 지도 서비스로 길찾기.
   *
   * 카카오: https 링크 하나로 앱·웹 모두 처리된다(앱 있으면 앱, 없으면 모바일 웹).
   * 네이버: 공식 스킴이 nmap://(앱 전용)이다. 출발지를 생략하면 현위치를 쓴다.
   *   appname은 필수 파라미터. 앱이 없으면 openURL이 실패하므로 그때만 웹으로 떨어뜨린다.
   *   (웹 폴백은 좌표 길찾기 URL이 불안정해 장소 검색으로 연다 — 거기서 도착지로 길찾기)
   * 어느 쪽이든 못 열면 알린다. 눌렀는데 아무 반응 없는 게 제일 나쁘다.
   */
  const openDirections = useCallback(async (provider: 'naver' | 'kakao') => {
    if (!vm) return;
    track(EVENT.navigation_clicked, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm.category_label,
      provider,
    });
    const name = encodeURIComponent(vm.name);
    try {
      if (provider === 'kakao') {
        await Linking.openURL(`https://map.kakao.com/link/to/${name},${vm.latitude},${vm.longitude}`);
        return;
      }
      // 네이버 — 앱 스킴 우선, 실패 시에만 웹
      const app = `nmap://route/walk?dlat=${vm.latitude}&dlng=${vm.longitude}&dname=${name}&appname=com.factorial9.dogear`;
      try {
        await Linking.openURL(app);
      } catch {
        await Linking.openURL(`https://map.naver.com/p/search/${name}`);
      }
    } catch (e) {
      console.error('[spot] 길찾기 실행 실패:', e);
      toast.error('지도 앱을 열지 못했어요. 주소를 복사해 사용해주세요');
    }
  }, [vm, id]);

  /** 지도 서비스 선택 시트 → 길찾기 */
  const handleDirections = useCallback(async () => {
    if (!vm) return;
    const idx = await actionSheet('길찾기', [
      { label: '네이버 지도' },
      { label: '카카오맵' },
    ]);
    if (idx === 0) openDirections('naver');
    else if (idx === 1) openDirections('kakao');
  }, [vm, openDirections]);

  /**
   * 외부 지도 앱에서 위치 보기 (길찾기와 다르다).
   *   길찾기는 `link/to` — 출발지를 묻고 경로를 그린다. 갈 결심이 선 사람이 누른다.
   *   여기는 `link/map` — 그냥 지도에 이 지점을 찍어 보여준다. 어디쯤인지 보려는 사람이 누른다.
   */
  const handleOpenMap = useCallback(async () => {
    if (!vm) return;
    track(EVENT.map_viewed, {
      screen_name: 'spot_detail',
      place_id: id,
      place_category: vm.category_label,
    });
    const url =
      `https://map.kakao.com/link/map/${encodeURIComponent(vm.name)},${vm.latitude},${vm.longitude}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.error('[spot] 지도 열기 실패:', e);
      toast.error('지도 앱을 열지 못했어요. 주소를 복사해 사용해주세요');
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

  // 갤러리 사진 길게 누르기 — 내 사진이면 삭제, 남의 사진이면 신고.
  //   삭제는 서버(delete-checkin-photo)가 스토리지·대표사진·검수큐까지 함께 정리한다.
  //   여기서 supabase를 직접 지우지 않는 이유: 그러면 파일이 남아 URL로 계속 보인다.
  const handleGalleryLongPress = useCallback(async (photo: SpotGalleryPhoto) => {
    if (!photo.is_mine) {
      const idx = await actionSheet('이 사진', [
        { label: '이 사진 신고하기', destructive: true },
      ]);
      if (idx === 0) {
        router.push({ pathname: '/report', params: { target_type: 'checkin_photo', target_id: photo.photo_id } });
      }
      return;
    }
    const idx = await actionSheet('내 사진', [
      { label: '이 사진 삭제하기', destructive: true },
    ]);
    if (idx !== 0) return;
    const ok = await confirm(
      PHOTO.deleteConfirm,
      { title: '이 사진을 삭제할까요?', confirmText: '삭제', destructive: true },
    );
    if (!ok) return;
    try {
      const { error } = await supabase.functions.invoke('delete-checkin-photo', {
        body: { photoId: photo.photo_id },
      });
      if (error) throw error;
      toast.success(PHOTO.deleted);
      serverDetail.refresh();
    } catch (e: any) {
      toast.error('사진을 삭제하지 못했어요. 잠시 후 다시 시도해주세요');
    }
  }, [router, serverDetail]);

  // ⋯ 메뉴. 항목 수 제한이 없다 — 자체 액션시트로 옮겼기 때문.
  //   (예전엔 OS Alert을 썼는데 안드로이드는 버튼 3개까지라 4번째인 '취소'가 잘려나가
  //    한번 열면 닫을 수 없었다)
  const handleMore = useCallback(async () => {
    // 길찾기는 지도 카드의 '빠른 길찾기'로 일원화 — 여기선 뺀다(중복 진입점 제거)
    const idx = await actionSheet(vm?.name ?? '장소', [
      { label: '공유하기' },
      { label: '정보 수정 제안' },
      { label: '이 장소 신고하기', destructive: true },
    ]);
    if (idx === 0) handleShare();
    else if (idx === 1) router.push({ pathname: '/info-correction', params: { spot_id: id } });
    else if (idx === 2) router.push({ pathname: '/report', params: { target_type: 'spot', target_id: id } });
  }, [vm, id, router, handleShare]);

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
        {/* 스크롤로 키비주얼이 밀려 올라갔을 때만 보인다 */}
        <Animated.Text
          style={[s.topNavTitle, { opacity: navTitleOpacity }]}
          numberOfLines={1}
        >
          {vm.name}
        </Animated.Text>
        <View style={s.topNavRight}>
          <TouchableOpacity style={s.topNavBtn} onPress={handleMore} hitSlop={8} accessibilityLabel="더보기">
            <Icon name="more" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ════════════════════════════════════
          스크롤 본문
      ════════════════════════════════════ */}
      <Animated.ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },   // opacity만 바꾸므로 네이티브 드라이버로 올린다
        )}
        scrollEventThrottle={16}
      >
        {/* ── 키비주얼 헤더 ──
            홈 '오늘의 추천' 카드와 같은 컴포넌트다. 스크림 농도·여백·저장 표시가
            화면마다 갈라지지 않도록 한 곳에서만 그린다. */}
        <SpotKeyVisual
          height={KEY_VISUAL_HEIGHT}
          name={vm.name}
          categoryLabel={vm.category_label}
          subcategory={vm.subcategory}
          coverImageUrl={vm.hero_image_url ?? vm.cover_image_url}
          metaText={[vm.region_summary, vm.distance_text].filter(Boolean).join(' · ')}
          savedCount={shownSavedCount}
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
            {/* 제공 서비스 — 한 업체가 병원+미용+호텔을 겸하는 경우가 흔하다(4,200곳).
                카테고리는 대표 하나뿐이라, 겸업 사실은 여기서만 드러난다.
                하나뿐이면 카테고리 배지와 같은 말이라 굳이 보이지 않는다. */}
            {(vm.services?.length ?? 0) > 1 && (
              <>
                {hasChips && <View style={s.infoSep} />}
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>서비스</Text>
                  <View style={s.facilityWrap}>
                    {vm.services!.map(sv => (
                      <View key={sv} style={s.serviceChip}>
                        <Text style={s.serviceChipText}>{catLabel[sv]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}
            {/* 전화 — 병원·미용에서 제일 먼저 찾는 값이라 설명보다 위에 둔다.
                영업시간 데이터가 없는 지금 "지금 하나요"는 전화로만 확인된다. */}
            {vm.phone && (
              <>
                {hasChips && <View style={s.infoSep} />}
                <View style={s.infoRow}>
                  <Text style={s.infoKey}>전화</Text>
                  <TouchableOpacity
                    style={s.phoneBtn}
                    onPress={() => handleCall(vm.phone!)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${vm.phone}로 전화 걸기`}
                  >
                    <Icon name="phone" size={14} color={Colors.brand.primary} />
                    <Text style={s.phoneText}>{vm.phone}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {vm.description && (
              <>
                {(hasChips || vm.phone) && <View style={s.infoSep} />}
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

          {/* 위치 — 지도와 액션을 한 카드로 묶는다.
              지도 따로, 버튼 따로 두면 둘이 남남처럼 보인다. 버튼을 카드 안 아래쪽에
              붙이고 가운데를 세로선으로 갈라, 이 액션들이 '이 지도에 대한 것'임을 형태로 말한다.

              ⚠️ 지도는 pointerEvents='none'인 그림이다. 예전에 지도 위에 투명 Touchable을
              얹었더니 안드로이드 네이티브 WebView가 터치를 먹어 눌러도 아무 일이 없었다
              (부모의 pointerEvents='none'은 WebView 자식에 확실히 전파되지 않는다).
              실제 동작은 WebView와 겹치지 않는 아래 액션 행이 받는다. */}
          <View style={s.mapCard}>
            <View style={s.mapCanvas} pointerEvents="none">
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
                style={{ flex: 1 }}
              />
            </View>

            <View style={s.mapActions}>
              <TouchableOpacity
                style={s.mapAction}
                onPress={handleDirections}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${vm.name} 길찾기`}
              >
                <Icon name="navigate" size={16} color={Colors.text.secondary} />
                <Text style={s.mapActionText}>빠른 길찾기</Text>
              </TouchableOpacity>

              <View style={s.mapActionDivider} />

              <TouchableOpacity
                style={s.mapAction}
                onPress={handleOpenMap}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${vm.name} 지도에서 보기`}
              >
                <Icon name="map" size={16} color={Colors.text.secondary} />
                <Text style={s.mapActionText}>지도에서 보기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── 장소 분위기 ──
            발도장을 **집계**해서 이 장소가 어떤 곳인지 답한다.

            예전엔 이 자리가 '최근 흔적'이었다 — 발도장을 시간순으로 3건 나열했다.
            그런데 '다녀간 강아지'가 누구인지를, '사진'이 사진을 각각 가져가고 나니
            흔적에 남은 건 상대시간 + 태그 하나뿐인 **익명의 시간 로그**였다.

            사용자가 장소 상세에서 알고 싶은 건 "여기 어때?"지 "누가 몇 시에 왔나"가
            아니다. 개별 흔적은 /visit-history가 이미 맡고 있으므로 링크만 남긴다.
            집계는 데이터가 적어도 성립한다 — 흔적 3건은 초라해 보이지만
            "조용해요 3"은 정보다. */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>장소 분위기</Text>
            {/* ⚠️ /visit-history/[id]는 **내 방문 기록만** 보여준다(남의 흔적이 아니다).
                예전 '최근 흔적'의 더보기도 같은 곳으로 갔는데 라벨이 '더보기'라
                이 장소 전체 흔적으로 가는 줄 읽혔다. 목적지대로 부른다. */}
            <TouchableOpacity style={s.sectionMore} onPress={() => router.push(`/visit-history/${id}`)}>
              <Text style={s.sectionMoreText}>내 방문 기록</Text>
              <Icon name="forward" size={12} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          {vm.tag_counts.length > 0 ? (
            <>
              <View style={s.moodTagRow}>
                {vm.tag_counts.map(({ tag, count }) => (
                  <View key={tag} style={s.moodTag}>
                    <Text style={s.moodTagLabel}>{feelingTagLabel[tag as FeelingTag] ?? tag}</Text>
                    {/* 로컬 폴백엔 횟수가 없다(0) — 그때는 숫자를 숨긴다 */}
                    {count > 0 && <Text style={s.moodTagCount}>{count}</Text>}
                  </View>
                ))}
              </View>
              {vm.total_checkin_count > 0 && (
                <Text style={s.moodMeta}>
                  발도장 {vm.total_checkin_count}개
                  {vm.recent_trace_count > 0 ? ` · 최근 ${vm.recent_trace_count}개` : ''}
                </Text>
              )}
            </>
          ) : (
            <View style={s.noTrace}>
              <Icon name="paw" size={20} color={Colors.text.tertiary} />
              <Text style={s.noTraceText}>아직 흔적이 없어요. 첫 발도장을 남겨보세요!</Text>
            </View>
          )}
        </View>

        {/* ── 다녀간 강아지 ──
            **누가 왔나**에만 답한다. 사진은 아래 별도 섹션이 맡는다.
            예전엔 이 둘을 '다녀간 강아지들'이라는 사진 레일 하나로 뭉쳐놨는데,
            그러다 보니 둘 다 못 했다 — 사진 5장 올린 강아지는 1장만 보이고,
            사진 없이 발도장만 찍은 강아지는 아예 안 보였다.

            ⚠️ 서버가 **familiar_layer 발도장만** 담아 보낸다. spot_only는
               "장소 분위기에만"을 고른 것이라 이름·아바타를 띄우면 안 된다. */}
        {(() => {
          const dogs = vm.visiting_dogs ?? [];
          // 접힘 = 가로 레일(ScrollView) / 펼침 = 줄바꿈 그리드(View)
          const Container: React.ComponentType<any> = expandDogs ? View : ScrollView;
          return (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>다녀간 강아지</Text>
                {/* 마릿수는 쓰지 않는다 — 바로 위 스탯 카드에 이미 같은 숫자가 있고,
                    레일에 아바타가 다 보이는데 세어줄 이유도 없다.
                    대신 레일은 끝이 어디인지 안 보이므로 펼칠 문을 둔다. */}
                {!expandDogs && dogs.length > DOG_RAIL_LIMIT && (
                  <TouchableOpacity style={s.sectionMore} onPress={() => setExpandDogs(true)}>
                    <Text style={s.sectionMoreText}>더보기</Text>
                    <Icon name="forward" size={12} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                )}
              </View>
              {dogs.length === 0 ? (
                <Text style={s.familiarEmptyText}>
                  아직 다녀간 강아지가 없어요. 첫 발도장을 남겨보세요.
                </Text>
              ) : (
                // 펼치면 세로로 흐르는 그리드다. 여기서 ScrollView를 쓰면 부모 세로
                // ScrollView와 중첩돼 스크롤이 서로 먹는다 — 일반 View로 그린다.
                <Container
                  {...(expandDogs
                    ? { style: s.familiarGrid }
                    : { horizontal: true, showsHorizontalScrollIndicator: false, contentContainerStyle: s.familiarRail })}
                >
                  {(expandDogs ? dogs : dogs.slice(0, DOG_RAIL_LIMIT)).map(dog => (
                    <TouchableOpacity
                      key={dog.dog_id}
                      style={s.familiarCell}
                      onPress={() => handleVisitingDogPress(dog)}
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
                        {/* 별도 섹션을 만들지 않고 배지로 흡수했다 */}
                        {dog.is_regular && (
                          <View style={s.dogBadge}><Text style={s.dogBadgeText}>단골</Text></View>
                        )}
                      </View>
                      <Text style={s.familiarName} numberOfLines={1}>{dog.name}</Text>
                      {/* 여기 있던 'N번 방문'을 뺐다.
                          ① 남의 강아지 방문 횟수는 행동 데이터다 — rules.ts의
                             softenedRecencyLabel이 "정확한 시간·횟수·패턴 절대 노출 금지"로
                             막아둔 것을 이 레일이 그대로 뚫고 있었다.
                          ② 목록에서 알고 싶은 건 '누가 왔나'지 '몇 번 왔나'가 아니다.
                             관계는 아래 시트가 완화된 문구로 말한다. */}
                      {(dog.is_mine || dog.is_familiar) && (
                        <Text style={s.familiarRecency} numberOfLines={1}>
                          {dog.is_mine ? '우리 아이' : '자주 마주쳐요'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </Container>
              )}
            </View>
          );
        })()}

        {/* ── 사진 ──
            전량 시간순 3열 그리드. 강아지당 제한이 없다 — 한 강아지가 5장을 올렸으면 5장 다 보인다.
            **이름을 붙이지 않는다.** 누가 왔는지는 위 '다녀간 강아지'가 답하고,
            이름을 떼야 spot_only("분위기에만 기여")로 올린 사진도 공개범위를 어기지 않는다.

            비어 있어도 섹션은 남긴다 — 섹션째 숨기면 "여기에 사진을 남길 수 있다"는 걸
            아무도 모른 채로 계속 비어 있게 된다(§4.7). */}
        {(() => {
          const photos = vm.photos?.items ?? [];
          const total = vm.photos?.total ?? photos.length;
          return (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>사진</Text>
                {total > 0 && <Text style={s.sectionCount}>{total}장</Text>}
              </View>
              {photos.length === 0 ? (
                <View style={s.galleryEmpty}>
                  <Text style={s.galleryEmptyText}>아직 사진이 없어요</Text>
                  <Text style={s.galleryEmptySub}>발도장을 남길 때 사진을 함께 올리면 여기에 모여요.</Text>
                </View>
              ) : (
                <>
                  <View style={s.photoGrid}>
                    {photos.map(photo => (
                      // 길게 누르면 — 내 사진은 '삭제', 남의 사진은 '신고'.
                      // 버튼을 늘어놓으면 사진보다 버튼이 먼저 보이므로 롱프레스에 숨긴다.
                      // (사진은 사전 검수 없이 올라오므로 신고가 사후 안전장치다)
                      <TouchableOpacity
                        key={photo.photo_id}
                        style={s.photoCell}
                        activeOpacity={0.9}
                        onLongPress={() => handleGalleryLongPress(photo)}
                        accessibilityRole="image"
                        accessibilityLabel={photo.is_mine
                          ? '내 강아지 사진. 길게 누르면 삭제'
                          : '사진. 길게 누르면 신고'}
                      >
                        <AppImage source={{ uri: photo.image_url }} style={s.photoImg} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {total > photos.length && (
                    <TouchableOpacity
                      style={s.photoMoreBtn}
                      onPress={() => router.push(`/spot/${id}/photos` as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.photoMoreText}>사진 {total}장 모두 보기</Text>
                      <Icon name="forward" size={13} color={Colors.brand.primary} />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          );
        })()}

      </Animated.ScrollView>

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
  // 좌(뒤로 44) · 우(더보기 44) 사이를 채워 가운데 정렬 — 폭이 같아 이름이 실제 중앙에 온다
  topNavTitle: {
    flex: 1,
    textAlign: 'center',
    ...Typography.label.l,
    fontWeight: '700',
    color: Colors.text.primary,
    marginHorizontal: Spacing[4],
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
  // ── 위치 카드 — 지도 + 액션 한 벌 ──
  mapCard: {
    width: '100%',
    marginTop: Spacing[12],
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.default,
  },
  // 지도에도 상단 라운드를 직접 준다. 안드로이드 WebView는 부모의 overflow:hidden으로
  // 확실히 잘리지 않는 경우가 있어, 카드와 지도 양쪽에 걸어 둔다.
  mapCanvas: {
    width: '100%',
    height: 180,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bg.tertiary,
  },
  mapActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.default,
  },
  mapAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    height: 48,
  },
  // 구분선은 위아래를 띄운다 — 끝까지 닿으면 카드가 두 조각으로 쪼개져 보인다
  mapActionDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing[12],
    backgroundColor: Colors.border.default,
  },
  mapActionText: { ...Typography.label.l, color: Colors.text.secondary, fontWeight: '600' },

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

  // ── 다녀간 강아지들 — 사진 갤러리 레일 ─────────────────────────
  galleryEmpty: { paddingVertical: Spacing[16], gap: Spacing[4] },
  galleryEmptyText: { ...Typography.body.m, color: Colors.text.secondary },
  galleryEmptySub: { ...Typography.caption, color: Colors.text.tertiary },

  // ── 자주 찾는 강아지 — 가로 스크롤 레일 ───────────────────────────
  sectionCount: { ...Typography.caption, color: Colors.text.tertiary },

  // ── 장소 분위기 ─────────────────────────────────────────
  moodTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[8], marginTop: Spacing[12] },
  moodTag: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[6],
    paddingHorizontal: Spacing[12], paddingVertical: Spacing[8],
    borderRadius: Radius.round,
    backgroundColor: Colors.surface.subtle,
  },
  moodTagLabel: { ...Typography.body.s, color: Colors.text.primary },
  moodTagCount: { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '700' },
  moodMeta: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[10] },

  // 펼친 상태 — 가로 레일 대신 줄바꿈 그리드
  familiarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[16], paddingTop: Spacing[12] },

  // 다녀간 강아지 배지 (단골)
  dogBadge: {
    position: 'absolute', bottom: -2, right: -2,
    paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    borderWidth: 2, borderColor: Colors.bg.primary,
  },
  dogBadgeText: { ...Typography.caption, fontSize: 9, lineHeight: 12, color: '#FFFFFF', fontWeight: '700' },
  familiarTag: { ...Typography.caption, fontSize: 10, color: Colors.brand.primary, marginTop: 1 },

  // 사진 3열 그리드.
  //   RN의 gap은 **퍼센트를 받지 않는다**(숫자만). 그래서 가로 간격은 space-between으로 만들고
  //   세로 간격만 rowGap(숫자)으로 준다. 셀 32% × 3 = 96%, 남는 4%가 가로 간격 둘이 된다.
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing[6] },
  photoCell: { width: '32%', aspectRatio: 1, borderRadius: Radius.m, overflow: 'hidden', backgroundColor: Colors.bg.secondary },
  photoImg: { width: '100%', height: '100%' },
  photoMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[4],
    marginTop: Spacing[12], paddingVertical: Spacing[10],
    borderRadius: Radius.m, borderWidth: 1, borderColor: Colors.border.default,
  },
  photoMoreText: { ...Typography.label.m, color: Colors.brand.primary },

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
    backgroundColor: Colors.brand.subtle,
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
  serviceChip: {
    paddingHorizontal: Spacing[10],
    paddingVertical: 4,
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.subtle,
    borderWidth: 1,
    borderColor: Colors.border.brand,
  },
  serviceChipText: { ...Typography.label.s, color: Colors.brand.accent, fontWeight: '600' },
  phoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
  },
  phoneText: {
    ...Typography.label.m,
    color: Colors.brand.primary,
    fontWeight: '700',
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

