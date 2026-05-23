/**
 * 발도장 플로우
 *
 * 역할: 짧고 가볍게 흔적을 남기는 핵심 행동
 *
 * 핵심 원칙:
 *   - 발도장은 하나의 행동으로 단순해야 한다
 *   - 긴 텍스트 입력 없음, 메타정보 기여 입력 없음
 *
 * 4단계:
 *   Step 1. 장소 확인    (P1)
 *   Step 2. 느낌/태그    (P2)
 *   Step 3. 공개 범위    (P1)
 *   Step 4. 완료 확인
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { AppImage } from '../src/components/common/AppImage';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Linking, Platform,
} from 'react-native';
import { notify } from '../src/utils/dialog';
import { track, EVENT } from '../src/utils/analytics';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { usePawCheckin } from '../src/hooks/usePawCheckin';
import { Button } from '../src/components/common/Button';
import { Icon } from '../src/components/common/Icon';
import { EmptyState } from '../src/components/common/EmptyState';
import type { FeelingTag, VisibilityLevel } from '../src/types';
import { feelingTagLabel, visibilityLabel } from '../src/utils/labels';
import { checkPawmarkProximity, formatDistanceShort } from '../src/utils/geo';
import { getPawmarkRadius, pawmarkCooldownRemainingMs } from '../src/config/checkin';
import * as Location from 'expo-location';

import { IS_REAL_AUTH } from '../src/config/env';



const FEELING_TAGS: FeelingTag[] = [
  'quiet', 'good', 'many_dogs', 'come_back_again', 'noisy', 'good_for_short_rest',
];

// ─── 공개 범위 상세 설명 ─────────────────────────────────────
const VISIBILITY_OPTIONS: {
  level: VisibilityLevel;
  icon: string;
  title: string;
  desc: string;
}[] = [
  // title은 labels.ts visibilityLabel SSOT 사용
  {
    level: 'private',
    icon:  'lock',
    title: visibilityLabel.private,
    desc:  '나만 볼 수 있는 기록이에요. 통계에도 반영되지 않아요.',
  },
  {
    level: 'spot_only',
    icon:  'map',
    title: visibilityLabel.spot_only,
    desc:  '장소 분위기 통계에만 더해져요. 우리 아이 정보는 나오지 않아요.',
  },
  {
    level: 'familiar_layer',
    icon:  'paw',
    title: visibilityLabel.familiar_layer,
    desc:  '안전 조건을 모두 충족한 강아지에게만 최소한의 정보로 소개돼요.',
  },
];

export default function PawCheckinModal() {
  const router = useRouter();
  const pawFlow        = useAppStore(s => s.pawFlow);
  const getHomeCards   = useAppStore(s => s.getHomeCards);
  const setPawStep     = useAppStore(s => s.setPawStep);
  const setPawSpot     = useAppStore(s => s.setPawSpot);
  const setPawTags     = useAppStore(s => s.setPawTags);
  const setPawVisibility = useAppStore(s => s.setPawVisibility);
  const submitPawCheckin = useAppStore(s => s.submitPawCheckin);
  const resetPawFlow   = useAppStore(s => s.resetPawFlow);
  const visitSummaries = useAppStore(s => s.visitSummaries);
  const dog            = useAppStore(s => s.dog);
  const spots            = useAppStore(s => s.spots);
  const currentLocation  = useAppStore(s => s.currentLocation);
  const setCurrentLocation = useAppStore(s => s.setCurrentLocation);

  const [isSuccess, setIsSuccess] = useState(false);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const { submit: submitToServer, isSubmitting } = usePawCheckin();

  // 발도장 가능 spot의 진짜 좌표/카테고리 (selectedSpot은 ViewModel이라 lat/lng 없음)
  const targetSpot = useMemo(() => {
    if (!pawFlow.selectedSpot) return null;
    return spots.find(s => s.spot_id === pawFlow.selectedSpot!.spot_id) ?? null;
  }, [pawFlow.selectedSpot, spots]);

  // 위치 근접성 판정 (실시간)
  const proximity = useMemo(() => {
    if (!targetSpot) return null;
    return checkPawmarkProximity({
      currentLocation,
      spot: {
        latitude: targetSpot.latitude,
        longitude: targetSpot.longitude,
        category: targetSpot.category,
      },
    });
  }, [targetSpot, currentLocation]);

  // 1시간 쿨다운 남은 시간 (ms). 같은 강아지 × 같은 spot 기준.
  const cooldownRemainingMs = useMemo(() => {
    if (!dog || !targetSpot) return 0;
    const summary = visitSummaries.find(
      v => v.dog_id === dog.dog_id && v.spot_id === targetSpot.spot_id,
    );
    return pawmarkCooldownRemainingMs(summary?.last_visit_at);
  }, [dog, targetSpot, visitSummaries]);
  const cooldownMinLeft = Math.ceil(cooldownRemainingMs / 60000);

  // 위치 새로고침 (사용자 액션)
  const refreshLocation = useCallback(async () => {
    setIsRefreshingLocation(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: req } = await Location.requestForegroundPermissionsAsync();
        if (req !== 'granted') {
          notify('위치 권한을 허용해야 발도장을 남길 수 있어요.', '위치 권한 필요');
          return;
        }
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,  // 발도장은 정확도 우선
      });
      setCurrentLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
      });
    } catch {
      notify('위치를 가져올 수 없어요. 잠시 후 다시 시도해주세요.', '위치 조회 실패');
    } finally {
      setIsRefreshingLocation(false);
    }
  }, [setCurrentLocation]);

  const { step, selectedSpot, selectedTags, visibility } = pawFlow;
  const cards = getHomeCards();

  // ── 진입 경로 감지 ────────────────────────────────────────
  // spot 상세에서 진입(setPawSpot 후 push)한 경우 selectedSpot이 이미 세팅됨
  // → step 1(장소 선택) 건너뛰고 step 2(느낌)부터 시작
  // 마운트 시점 한 번만 판정 (이후 사용자가 step 1 변경하더라도 이 플래그는 유지)
  const isPresetSpot = useRef<boolean>(!!selectedSpot).current;

  useEffect(() => {
    // 강아지 미등록 상태에서 진입 시 입력 흐름 시작 전에 차단
    if (!dog) {
      notify(
        '발도장을 남기려면 먼저 강아지 프로필이 필요해요.',
        '강아지 등록 필요',
      );
      resetPawFlow();
      router.replace('/(auth)/dog-setup');
      return;
    }
    if (isPresetSpot && pawFlow.step === 1) {
      setPawStep(2);
    }
    // 진입 자체가 발도장 시작 액션
    track(EVENT.pawmark_start_clicked, {
      screen_name: 'paw_checkin',
      source_screen: isPresetSpot ? 'spot_detail' : 'paw_tab',
      place_id: selectedSpot?.spot_id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    resetPawFlow();
    router.back();
  }, [resetPawFlow, router]);

  const handleNext = useCallback(() => setPawStep(step + 1), [step, setPawStep]);
  const handleBack = useCallback(() => {
    // 미리 선택된 장소로 진입 → step 2 에서 뒤로가기는 모달 닫음
    // (장소 자체를 바꾸려면 상세 페이지로 돌아가서 다시 진입)
    if (step === 1 || (isPresetSpot && step === 2)) {
      handleClose();
    } else {
      setPawStep(step - 1);
    }
  }, [step, setPawStep, handleClose, isPresetSpot]);

  const handleSubmit = useCallback(async () => {
    // ── 강아지 등록 가드 ──────────────────────────────────────
    // 강아지 없이는 발도장 의미 없음. 등록 화면으로 안내.
    if (!dog) {
      notify(
        '발도장을 남기려면 먼저 강아지 프로필이 필요해요.',
        '강아지 등록 필요',
      );
      resetPawFlow();
      router.replace('/(auth)/dog-setup');
      return;
    }
    // ── 위치 근접성 가드 ──────────────────────────────────────
    // 사용자가 spot 근처(카테고리별 반경)에 실제로 있어야만 발도장 가능
    if (!targetSpot) {
      notify('장소 정보를 불러올 수 없어요.', '오류');
      return;
    }
    // ── 1시간 쿨다운 가드 ────────────────────────────────────
    if (cooldownRemainingMs > 0) {
      track(EVENT.pawmark_blocked_cooldown, {
        screen_name: 'paw_checkin',
        place_id: targetSpot.spot_id,
        remaining_min: cooldownMinLeft,
      });
      notify(
        `같은 장소엔 1시간에 한 번만 발도장을 남길 수 있어요.\n${cooldownMinLeft}분 후에 다시 시도해주세요.`,
        '잠시 후 다시 가능',
      );
      return;
    }
    if (proximity && !proximity.ok) {
      const radius = getPawmarkRadius(targetSpot.category);
      if (proximity.reason === 'invalid_spot') {
        notify(
          '장소 좌표 정보가 올바르지 않아요. 운영진에게 신고해주시면 확인하겠습니다.',
          '장소 정보 오류',
        );
        return;
      }
      if (proximity.reason === 'no_location') {
        track(EVENT.pawmark_blocked_no_location, {
          screen_name: 'paw_checkin',
          place_id: targetSpot.spot_id,
        });
        notify(
          '발도장을 남기려면 위치 권한이 필요해요. 권한 허용 후 다시 시도해주세요.',
          '위치 권한 필요',
        );
        await refreshLocation();
        return;
      }
      if (proximity.reason === 'low_accuracy') {
        track(EVENT.pawmark_blocked_low_accuracy, {
          screen_name: 'paw_checkin',
          place_id: targetSpot.spot_id,
          accuracy: Math.round(proximity.accuracy),
        });
        notify(
          `현재 위치 정확도가 낮아요 (±${Math.round(proximity.accuracy)}m).\n야외 또는 창가로 이동해 위치를 새로고침해주세요.`,
          '위치 정확도 부족',
        );
        return;
      }
      if (proximity.reason === 'too_far') {
        track(EVENT.pawmark_blocked_too_far, {
          screen_name: 'paw_checkin',
          place_id: targetSpot.spot_id,
          distance_m: Math.round(proximity.distance),
          allowed_m: Math.round(proximity.allowed),
        });
        notify(
          `현재 ${targetSpot.name}에서 약 ${formatDistanceShort(proximity.distance)} 떨어져 있어요.\n발도장은 장소 가까이(약 ${radius}m 이내)에서만 남길 수 있어요.`,
          '장소 근처로 이동해주세요',
        );
        return;
      }
    }
    // ── 가드 통과 → 실제 제출 ──────────────────────────────────
    if (IS_REAL_AUTH) {
      try {
        await submitToServer(); // Edge Function → Supabase 저장
      } catch (err: any) {
        // 쿨다운/일일제한 분기 — 메시지 패턴으로 구분
        const msg = err?.message ?? '';
        const eventName =
          /cooldown|쿨다운|간격/i.test(msg)         ? EVENT.pawmark_blocked_cooldown :
          /daily|일일|하루|limit/i.test(msg)        ? EVENT.pawmark_blocked_daily_limit :
                                                      EVENT.pawmark_submit_failed;
        track(eventName, {
          screen_name: 'paw_checkin',
          place_id: selectedSpot?.spot_id,
          error_message: msg.slice(0, 100),
        });
        notify(msg || '잠시 후 다시 시도해주세요.', '발도장 저장 실패');
        return;
      }
    }
    submitPawCheckin(); // 로컬 store 업데이트 (즉각적인 UI 반영)
    track(EVENT.pawmark_completed, {
      screen_name: 'paw_checkin',
      place_id: selectedSpot?.spot_id,
      tag_count: selectedTags.length,
      has_note: !!pawFlow.note,
      visibility: pawFlow.visibility,
    });
    setIsSuccess(true);
  }, [submitPawCheckin, submitToServer, selectedSpot, selectedTags, pawFlow, targetSpot, proximity, refreshLocation, dog, resetPawFlow, router, cooldownRemainingMs, cooldownMinLeft]);

  const handleGoHome = useCallback(() => {
    resetPawFlow();
    router.replace('/(tabs)');
  }, [resetPawFlow, router]);

  const handleRestart = useCallback(() => {
    resetPawFlow();
    setIsSuccess(false);
  }, [resetPawFlow]);

  const toggleTag = useCallback((tag: FeelingTag) => {
    if (selectedTags.includes(tag)) {
      setPawTags(selectedTags.filter(t => t !== tag));
    } else {
      setPawTags([...selectedTags, tag]);
    }
  }, [selectedTags, setPawTags]);

  // 방문 횟수 — submitPawCheckin() 호출 직후 store가 업데이트되므로
  // isSuccess=true 시 이미 최신 값을 읽어옴 (Zustand는 동기 업데이트)
  const successVisitCount = useMemo(() => {
    if (!selectedSpot || !dog) return 1;
    const sv = visitSummaries.find(v => v.spot_id === selectedSpot.spot_id && v.dog_id === dog.dog_id);
    return sv ? sv.visit_count : 1;
  }, [selectedSpot, dog, visitSummaries]);

  // ── 성공 화면 ──────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.successContainer}>
          {/* 발바닥 아이콘 */}
          <View style={s.successIconRing}>
            <View style={s.successIconCircle}>
              <Icon name="paw-filled" size={44} color={Colors.brand.primary} />
            </View>
          </View>

          {/* 메시지 */}
          <View style={s.successTextBlock}>
            <Text style={s.successTitle}>발도장 완료!</Text>
            <Text style={s.successSubtitle}>
              {dog?.name}와 함께한 추억이 하나 더 쌓였어요 🐾
            </Text>
          </View>

          {/* 요약 카드 */}
          <View style={[s.summaryCard, { width: '100%' }]}>
            <View style={s.successSummaryRow}>
              <Icon name="map" size={16} color={Colors.text.tertiary} />
              <Text style={s.successSummaryLabel}>장소</Text>
              <Text style={s.successSummaryValue}>{selectedSpot?.name ?? '—'}</Text>
            </View>
            {successVisitCount > 0 && (
              <View style={s.successSummaryRow}>
                <Icon name="paw" size={16} color={Colors.text.tertiary} />
                <Text style={s.successSummaryLabel}>누적 방문</Text>
                <Text style={[s.successSummaryValue, { color: Colors.brand.accent, fontWeight: '700' }]}>
                  총 {successVisitCount}회
                </Text>
              </View>
            )}
            {selectedTags.length > 0 && (
              <View style={s.successSummaryRow}>
                <Icon name="flag" size={16} color={Colors.text.tertiary} />
                <Text style={s.successSummaryLabel}>느낌</Text>
                <Text style={s.successSummaryValue}>
                  {selectedTags.map(t => feelingTagLabel[t]).join(', ')}
                </Text>
              </View>
            )}
          </View>

          {/* 분위기 힌트 */}
          <Text style={s.successHint}>
            오늘 방문이 장소 분위기 통계에 반영됐어요
          </Text>
        </View>

        <View style={s.footer}>
          <TouchableOpacity style={s.restartBtn} onPress={handleRestart} activeOpacity={0.75}>
            <Icon name="paw" size={15} color={Colors.brand.primary} />
            <Text style={s.restartBtnText}>발도장 다시 찍기</Text>
          </TouchableOpacity>
          <Button
            label="홈으로 돌아가기"
            onPress={handleGoHome}
            variant="primary"
            size="l"
            fullWidth
          />
        </View>
      </SafeAreaView>
    );
  }

  // 단계 레이블 — 진입 경로에 따라 다름
  // preset (spot 상세 진입): 장소 선택 단계 생략 → 3단계 인디케이터
  const STEP_LABELS = isPresetSpot
    ? ['느낌', '공개 범위', '완료']
    : ['장소', '느낌', '공개 범위', '완료'];
  const totalSteps  = STEP_LABELS.length;
  // 내부 step(1~4) → 인디케이터 표시용 인덱스(1~totalSteps) 변환
  const indicatorStep = isPresetSpot ? Math.max(1, step - 1) : step;

  return (
    <SafeAreaView style={s.safe}>
      {/* 헤더 — 뒤로가기 + 단계 표시 */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={s.headerBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={step === 1 ? '닫기' : '이전 단계'}
          accessibilityRole="button"
        >
          <Icon name={step === 1 ? 'close' : 'back'} size={22} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={s.stepIndicator}>
          {STEP_LABELS.map((_label, i) => {
            const n = i + 1;
            const done   = n < indicatorStep;
            const active = n === indicatorStep;
            return (
              <React.Fragment key={n}>
                <View style={[s.stepNode, done && s.stepNodeDone, active && s.stepNodeActive]}>
                  {done ? (
                    <Icon name="check" size={11} color={Colors.brand.onPrimary} />
                  ) : (
                    <Text style={[s.stepNodeText, active && s.stepNodeTextActive]}>{n}</Text>
                  )}
                </View>
                {n < totalSteps && (
                  <View style={[s.stepLine, n < step && s.stepLineDone]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        <View style={s.headerBtn} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── STEP 1: 장소 확인 (preset 진입 시 즉시 step 2로 advance, 깜박임 방지) ── */}
        {step === 1 && !isPresetSpot && (() => {
          const nearbyCards = cards.slice(0, 5);
          const otherCards  = cards.slice(5);
          return (
            <View style={s.stepContainer}>
              <View style={s.stepTitleBlock}>
                <Text style={s.stepTitle}>어디서 산책했나요?</Text>
                <Text style={s.stepDesc}>선택한 장소에 발도장이 기록돼요</Text>
              </View>

              {/* 신규 장소 등록 — 최상단 */}
              <TouchableOpacity
                style={s.newSpotCard}
                onPress={() => router.push('/suggest-spot?from=paw')}
                activeOpacity={0.8}
              >
                <View style={s.newSpotIconWrap}>
                  <Icon name="plus" size={22} color={Colors.brand.primary} />
                </View>
                <View style={s.spotInfo}>
                  <Text style={s.spotName}>새 장소 직접 추가하기</Text>
                  <Text style={s.spotMeta}>목록에 없어도 괜찮아요</Text>
                </View>
                <Icon name="forward" size={18} color={Colors.brand.primary} />
              </TouchableOpacity>

              {cards.length === 0 ? (
                <EmptyState
                  headline="주변 장소가 없어요"
                  description="위치 권한을 허용하거나 탐색 탭에서 먼저 장소를 찾아보세요."
                  ctaLabel="지도 보기"
                  onCta={() => { resetPawFlow(); router.replace('/(tabs)/map'); }}
                />
              ) : (
                <>
                  {/* 구분선 — 주변 장소 */}
                  <View style={s.spotSeparator}>
                    <View style={s.separatorLine} />
                    <Text style={s.separatorText}>주변 장소</Text>
                    <View style={s.separatorLine} />
                  </View>

                  <View style={s.spotList}>
                    {nearbyCards.map(card => (
                      <TouchableOpacity
                        key={card.spot_id}
                        style={[s.spotItem, selectedSpot?.spot_id === card.spot_id && s.spotItemSelected]}
                        onPress={() => setPawSpot(card)}
                        activeOpacity={0.8}
                      >
                        {card.cover_image_url ? (
                          <AppImage
                            source={{ uri: card.cover_image_url }}
                            style={s.spotThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[s.spotThumb, s.spotThumbFallback]}>
                            <Icon name="leaf-filled" size={16} color={Colors.brand.primary} />
                          </View>
                        )}
                        <View style={s.spotInfo}>
                          <Text style={s.spotName}>{card.name}</Text>
                          <Text style={s.spotMeta}>{card.category_label} · {card.distance_text}</Text>
                        </View>
                        {selectedSpot?.spot_id === card.spot_id && (
                          <Icon name="check" size={18} color={Colors.brand.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* 다른 지역 추천 */}
                  {otherCards.length > 0 && (
                    <>
                      <View style={s.spotSeparator}>
                        <View style={s.separatorLine} />
                        <Text style={s.separatorText}>조금 더 먼 곳</Text>
                        <View style={s.separatorLine} />
                      </View>
                      <View style={s.spotList}>
                        {otherCards.map(card => (
                          <TouchableOpacity
                            key={card.spot_id}
                            style={[s.spotItem, s.spotItemOther, selectedSpot?.spot_id === card.spot_id && s.spotItemSelected]}
                            onPress={() => setPawSpot(card)}
                            activeOpacity={0.8}
                          >
                            {card.cover_image_url ? (
                              <AppImage
                                source={{ uri: card.cover_image_url }}
                                style={s.spotThumb}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={[s.spotThumb, s.spotThumbFallback]}>
                                <Icon name="leaf-filled" size={16} color={Colors.brand.primary} />
                              </View>
                            )}
                            <View style={s.spotInfo}>
                              <Text style={s.spotName}>{card.name}</Text>
                              <Text style={s.spotMeta}>{card.category_label} · {card.distance_text}</Text>
                            </View>
                            {selectedSpot?.spot_id === card.spot_id && (
                              <Icon name="check" size={18} color={Colors.brand.primary} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          );
        })()}

        {/* ── STEP 2: 느낌/태그 ── */}
        {step === 2 && (
          <View style={s.stepContainer}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepTitle}>오늘 산책은 어땠나요?</Text>
              <Text style={s.stepDesc}>떠오르는 게 없으면 그냥 넘어가도 돼요</Text>
            </View>

            <View style={s.tagGrid}>
              {FEELING_TAGS.map(tag => (
                <TouchableOpacity
                  key={tag}
                  style={[s.tagChip, selectedTags.includes(tag) && s.tagChipSelected]}
                  onPress={() => toggleTag(tag)}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedTags.includes(tag) }}
                  accessibilityLabel={feelingTagLabel[tag]}
                >
                  <Text style={[s.tagChipText, selectedTags.includes(tag) && s.tagChipTextSelected]}>
                    {feelingTagLabel[tag]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── STEP 3: 공개 범위 ── */}
        {step === 3 && (
          <View style={s.stepContainer}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepTitle}>이 발도장, 누구에게 보여줄까요?</Text>
              <Text style={s.stepDesc}>나중에 언제든 바꿀 수 있어요</Text>
            </View>

            <View style={s.visibilityList}>
              {VISIBILITY_OPTIONS.map(opt => {
                const selected = visibility === opt.level;
                return (
                  <TouchableOpacity
                    key={opt.level}
                    style={[s.visibilityCard, selected && s.visibilityCardSelected]}
                    onPress={() => setPawVisibility(opt.level)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${opt.title}, ${opt.desc}`}
                  >
                    <View style={[s.visibilityIcon, selected && s.visibilityIconSelected]}>
                      <Icon name={opt.icon as any} size={20} color={selected ? Colors.brand.onPrimary : Colors.text.secondary} />
                    </View>
                    <View style={s.visibilityText}>
                      <Text style={[s.visibilityTitle, selected && s.visibilityTitleSelected]}>
                        {opt.title}
                      </Text>
                      <Text style={s.visibilityDesc}>{opt.desc}</Text>
                    </View>
                    {selected && (
                      <Icon name="check" size={18} color={Colors.brand.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── STEP 4: 완료 확인 ── */}
        {step === 4 && (
          <View style={s.stepContainer}>
            <View style={s.confirmIconWrap}>
              <View style={s.confirmIconCircle}>
                <Icon name="paw-filled" size={36} color={Colors.brand.primary} />
              </View>
              <Text style={s.stepTitle}>발도장을 남길게요!</Text>
            </View>

            <View style={s.summaryCard}>
              <SummaryRow label="장소"      value={selectedSpot?.name ?? '—'} />
              <SummaryRow
                label="느낌"
                value={selectedTags.length > 0
                  ? selectedTags.map(t => feelingTagLabel[t]).join(', ')
                  : '선택 안 함'}
              />
              <SummaryRow label="공개 범위" value={visibilityLabel[visibility]} />
            </View>

            {/* ── 1시간 쿨다운 안내 ───────────────────────────────── */}
            {targetSpot && cooldownRemainingMs > 0 && (
              <View style={[s.proximityCard, s.proximityFail]}>
                <View style={s.proximityRow}>
                  <Icon name="bell" size={18} color={Colors.status.error.text} />
                  <Text style={[s.proximityTitle, { color: Colors.status.error.text }]}>
                    {cooldownMinLeft}분 후에 다시 가능
                  </Text>
                </View>
                <Text style={s.proximityHint}>
                  같은 장소엔 1시간에 한 번만 발도장을 남길 수 있어요.
                </Text>
              </View>
            )}

            {/* ── 위치 근접성 상태 패널 ─────────────────────────────── */}
            {targetSpot && proximity && (
              <View
                style={[
                  s.proximityCard,
                  proximity.ok ? s.proximityOk : s.proximityFail,
                ]}
              >
                <View style={s.proximityRow}>
                  <Icon
                    name={proximity.ok ? 'location' : 'lock'}
                    size={18}
                    color={proximity.ok ? Colors.status.success.text : Colors.status.error.text}
                  />
                  <Text
                    style={[
                      s.proximityTitle,
                      { color: proximity.ok ? Colors.status.success.text : Colors.status.error.text },
                    ]}
                  >
                    {proximity.ok
                      ? '장소 근처에 있어요'
                      : proximity.reason === 'no_location'
                        ? '위치 권한이 필요해요'
                        : proximity.reason === 'low_accuracy'
                          ? `위치 정확도가 낮아요 (±${Math.round(proximity.accuracy)}m)`
                          : proximity.reason === 'invalid_spot'
                            ? '장소 좌표 정보가 올바르지 않아요'
                            : `장소에서 약 ${formatDistanceShort(proximity.distance)} 떨어져 있어요`}
                  </Text>
                </View>
                {!proximity.ok && proximity.reason === 'too_far' && (
                  <Text style={s.proximityHint}>
                    발도장은 약 {getPawmarkRadius(targetSpot.category)}m 이내에서만 남길 수 있어요. 장소에 도착한 뒤 다시 시도해주세요.
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: Spacing[12], flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    onPress={refreshLocation}
                    disabled={isRefreshingLocation}
                    style={s.proximityRefresh}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="위치 새로고침"
                  >
                    <Icon name="refresh" size={14} color={Colors.brand.primary} />
                    <Text style={s.proximityRefreshText}>
                      {isRefreshingLocation ? '확인 중…' : '위치 새로고침'}
                    </Text>
                  </TouchableOpacity>
                  {/* 위치 권한 거부 상태에서 OS 설정으로 직접 안내 (네이티브만) */}
                  {!proximity.ok &&
                    proximity.reason === 'no_location' &&
                    Platform.OS !== 'web' && (
                      <TouchableOpacity
                        onPress={() => Linking.openSettings().catch(() => {})}
                        style={s.proximityRefresh}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="설정 열기"
                      >
                        <Text style={s.proximityRefreshText}>설정 열기</Text>
                      </TouchableOpacity>
                    )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={s.footer}>
        {step < 4 ? (
          <Button
            label={
              step === 1 ? (selectedSpot ? '다음' : '장소를 선택해주세요') :
              step === 2 ? '다음' :
              '완료 확인'
            }
            onPress={handleNext}
            variant="primary"
            size="l"
            fullWidth
            disabled={step === 1 && !selectedSpot}
          />
        ) : (
          <Button
            label={
              isSubmitting
                ? '저장 중...'
                : cooldownRemainingMs > 0
                  ? `${cooldownMinLeft}분 후 가능`
                  : proximity && !proximity.ok
                    ? (proximity.reason === 'too_far'
                        ? '장소 근처로 이동해주세요'
                        : proximity.reason === 'no_location'
                          ? '위치 권한 필요'
                          : proximity.reason === 'invalid_spot'
                            ? '장소 정보 오류'
                            : '위치 정확도 부족')
                    : '발도장 찍기'
            }
            onPress={handleSubmit}
            variant="primary"
            size="l"
            fullWidth
            disabled={isSubmitting || cooldownRemainingMs > 0 || !!(proximity && !proximity.ok)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── 완료 확인 요약 행 ────────────────────────────────────────
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={sum.row}>
      <Text style={sum.label}>{label}</Text>
      <Text style={sum.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[14],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // 단계 인디케이터
  stepIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  stepNode: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNodeDone:       { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },
  stepNodeActive:     { borderColor: Colors.brand.primary, backgroundColor: Colors.surface.selected },
  stepNodeText:       { ...Typography.label.s, color: Colors.text.tertiary },
  stepNodeTextActive: { color: Colors.brand.accent, fontWeight: '700' },
  stepLine:           { flex: 1, height: 2, backgroundColor: Colors.border.default, maxWidth: 36 },
  stepLineDone:       { backgroundColor: Colors.brand.primary },

  scroll:  { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: Spacing[24] },

  stepContainer:  { gap: Spacing[20] },
  stepTitleBlock: { gap: Spacing[6] },
  stepTitle:      { ...Typography.display.s, color: Colors.text.primary },
  stepDesc:       { ...Typography.body.m, color: Colors.text.secondary, lineHeight: 22 },

  // 신규 장소 등록 카드
  newSpotCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing[16],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    borderWidth: 1.5, borderColor: Colors.brand.primaryLight,
    gap: Spacing[12],
  },
  newSpotIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.brand.primaryLight,
  },

  // 구분선
  spotSeparator: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[10],
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: Colors.border.subtle },
  separatorText: { ...Typography.label.s, color: Colors.text.tertiary, fontWeight: '600' },

  // 장소 목록
  spotList: { gap: Spacing[10] },
  spotItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing[12],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border.default,
    gap: Spacing[12],
  },
  spotItemSelected: { borderColor: Colors.brand.primary, backgroundColor: Colors.surface.selected },
  spotItemOther:    { opacity: 0.85 },

  // 썸네일
  spotThumb: {
    width: 52, height: 52, borderRadius: Radius.m,
    backgroundColor: Colors.brand.subtle,
    flexShrink: 0,
  },
  spotThumbFallback: {
    alignItems: 'center', justifyContent: 'center',
  },

  spotInfo: { flex: 1 },
  spotName: { ...Typography.label.l, color: Colors.text.primary, fontWeight: '600' },
  spotMeta: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 3 },

  // 태그 그리드
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[10] },
  tagChip: {
    paddingHorizontal: Spacing[20], paddingVertical: Spacing[14],
    borderRadius: Radius.round,
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5, borderColor: Colors.border.default,
  },
  tagChipSelected:     { backgroundColor: Colors.surface.selected, borderColor: Colors.brand.primary },
  tagChipText:         { ...Typography.label.m, color: Colors.text.secondary },
  tagChipTextSelected: { color: Colors.brand.accent, fontWeight: '700' },

  // 공개 범위 카드
  visibilityList: { gap: Spacing[10] },
  visibilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[14],
    padding: Spacing[16],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  visibilityCardSelected: { borderColor: Colors.brand.primary, backgroundColor: Colors.surface.selected },
  visibilityIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  visibilityIconSelected: { backgroundColor: Colors.brand.primary },
  visibilityText:          { flex: 1, gap: Spacing[4] },
  visibilityTitle:         { ...Typography.label.l, color: Colors.text.primary, fontWeight: '600' },
  visibilityTitleSelected: { color: Colors.brand.accent },
  visibilityDesc:          { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 18 },

  // 완료 확인
  confirmIconWrap: { alignItems: 'center', gap: Spacing[12] },
  confirmIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  summaryCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },

  footer: {
    padding: Spacing[16],
    paddingBottom: Spacing[32],
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
    gap: Spacing[10],
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    paddingVertical: Spacing[14],
  },
  restartBtnText: {
    ...Typography.label.m,
    color: Colors.brand.primary,
    fontWeight: '600',
  },

  // ── 성공 화면 ─────────────────────────────────────────────────────
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[24],
    gap: Spacing[24],
  },
  successIconRing: {
    padding: 8,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: Colors.brand.primaryLight,
    borderStyle: 'dashed',
  },
  successIconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  successTextBlock: {
    alignItems: 'center',
    gap: Spacing[8],
  },
  successTitle: {
    ...Typography.display.s,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  successSubtitle: {
    ...Typography.body.m,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  successSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing[10],
  },
  successSummaryLabel: {
    ...Typography.label.m,
    color: Colors.text.tertiary,
    width: 68,
  },
  successSummaryValue: {
    flex: 1,
    ...Typography.body.m,
    color: Colors.text.primary,
  },
  successHint: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── 위치 근접성 패널 ─────────────────────────────────────
  proximityCard: {
    marginTop: Spacing[12],
    borderRadius: Radius.m,
    paddingHorizontal: Spacing[14],
    paddingVertical: Spacing[12],
    borderWidth: 1,
    gap: Spacing[6],
  },
  proximityOk: {
    backgroundColor: Colors.status.success.bg,
    borderColor: Colors.status.success.text,
  },
  proximityFail: {
    backgroundColor: Colors.status.error.bg,
    borderColor: Colors.status.error.text,
  },
  proximityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[8],
  },
  proximityTitle: {
    ...Typography.label.l,
    fontWeight: '600',
    flex: 1,
  },
  proximityHint: {
    ...Typography.label.s,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  proximityRefresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    alignSelf: 'flex-start',
    paddingVertical: Spacing[4],
  },
  proximityRefreshText: {
    ...Typography.label.s,
    color: Colors.brand.primary,
    fontWeight: '600',
  },
});

const sum = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[14],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
    gap: Spacing[12], alignItems: 'flex-start',
  },
  label: { ...Typography.label.m, color: Colors.text.tertiary, width: 72 },
  value: { flex: 1, ...Typography.body.m, color: Colors.text.primary },
});
