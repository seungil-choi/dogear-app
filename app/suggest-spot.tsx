/**
 * 장소 제안 플로우
 *
 * 역할: 사용자가 앱에 없는 장소를 제안하는 경로
 * 진입: 발도장 플로우(장소 없을 때) / 탐색 검색 결과 없을 때
 *
 * 단계:
 *   checking      — 주변 중복 자동 검사 (로딩)
 *   duplicate_check — 반경 15m 내 유사 장소 있을 때
 *   form          — 제안 입력 (이름·카테고리 필수 / 설명·태그·사진 선택)
 *   done          — 완료 + 임시 반영 안내 + CTA
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { PERM, PHOTO } from '../src/constants/messages';
import { isObjectionable, MODERATION_BLOCK_MESSAGE } from '../src/utils/moderation';
import { track, EVENT } from '../src/utils/analytics';
import * as ImagePicker from 'expo-image-picker';
import { stripExif } from '../src/lib/stripExif';
import * as Location from 'expo-location';
import { formatKoreanAddress, extractNeighborhood } from '../src/utils/address';
import { AppImage } from '../src/components/common/AppImage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '../src/constants/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { supabase } from '../src/lib/supabase';
import { uploadImage } from '../src/lib/uploadImage';
import { Button } from '../src/components/common/Button';
import { Icon } from '../src/components/common/Icon';
import KakaoMap from '../src/components/map/KakaoMap';
import type { SpotCategory, NearbyDuplicate } from '../src/types';

import { IS_REAL_AUTH } from '../src/config/env';

// 지도는 전 플랫폼 KakaoMap(WebView) 사용 — react-native-maps는 Android에서
// Google Maps API 키가 없으면 마운트 즉시 네이티브 크래시(앱 튕김)라 제거함.

// ─── 카테고리 옵션 ──────────────────────────────────────────
const CATEGORY_OPTIONS: { key: SpotCategory; label: string }[] = [
  { key: 'park',      label: '공원'       },
  { key: 'trail',     label: '산책로'     },
  { key: 'riverside', label: '강변·하천'  },
  { key: 'rest_spot', label: '쉼터·광장'  },
  { key: 'beach',     label: '해변'       },
  { key: 'pet_cafe',  label: '애견 카페'  },
  { key: 'vet',          label: '동물병원'   },
  { key: 'pet_grooming', label: '애견 미용'  },
  { key: 'pet_boarding', label: '애견 호텔·유치원' },
  // 맨 끝 — 맞는 게 없을 때만. 앞의 것들을 먼저 훑게 한다.
  { key: 'other',        label: '기타'       },
];

// ─── 추가 태그 옵션 ──────────────────────────────────────────
const TAG_OPTIONS = [
  '조용해요', '넓어요', '그늘 있어요', '벤치 있어요',
  '반려동물 환영', '쓰레기통 있어요', '주차 가능', '야간 조명',
];

type Step = 'checking' | 'duplicate_check' | 'form' | 'done';

// 서울 중심 기본 좌표 (currentLocation이 없을 때 fallback)
const DEFAULT_LOCATION = { latitude: 37.5665, longitude: 126.9780 };

/** 핀을 끄는 동안 매 프레임 역지오코딩하지 않도록 기다리는 시간 */
const ADDRESS_LOOKUP_DEBOUNCE_MS = 700;

/**
 * 핀 좌표 → 주소. 실패하면 null.
 *
 * 주소는 "있으면 좋은 값"이지 제안을 막을 값이 아니다. 네트워크·권한·플랫폼 어느
 * 쪽이 실패하든 조용히 포기하고 좌표만으로 제안을 진행시킨다(기존 동작과 동일).
 */
async function lookupAddress(
  latitude: number,
  longitude: number,
): Promise<{ addressText: string; neighborhood: string | null } | null> {
  try {
    const [first] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!first) return null;   // 웹은 항상 빈 배열
    const addressText = formatKoreanAddress(first);
    if (!addressText) return null;
    return { addressText, neighborhood: extractNeighborhood(addressText) };
  } catch {
    return null;
  }
}

export default function SuggestSpotScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const from   = params.from ?? 'map'; // 'paw' | 'map'

  const currentLocation    = useAppStore(s => s.currentLocation);
  const getNearbyDuplicates = useAppStore(s => s.getNearbyDuplicates);
  const suggestSpot         = useAppStore(s => s.suggestSpot);
  const user                = useAppStore(s => s.activeDog);
  const getHomeCards       = useAppStore(s => s.getHomeCards);
  const setPawSpot         = useAppStore(s => s.setPawSpot);
  const setPawStep         = useAppStore(s => s.setPawStep);
  const resetPawFlow       = useAppStore(s => s.resetPawFlow);

  const location = currentLocation ?? DEFAULT_LOCATION;

  // ── 상태 ──────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('checking');
  const [duplicates, setDuplicates] = useState<NearbyDuplicate[]>([]);
  const [hasHardBlock, setHasHardBlock] = useState(false);
  /** 부적절 표현 차단 — 어느 칸이 문제인지 나눠서 알려준다 */
  const [blocked, setBlocked] = useState<{ name?: boolean; description?: boolean }>({});
  const [createdSpotId, setCreatedSpotId] = useState<string | null>(null);
  /** 중복 후보 중 사용자가 고른 것. 후보가 하나면 자동 선택한다(고를 게 없으므로). */
  const [selectedDupId, setSelectedDupId] = useState<string | null>(null);

  // Form state
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<SpotCategory>('park');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pinLocation, setPinLocation] = useState({ latitude: location.latitude, longitude: location.longitude });
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  /** 핀 위치의 주소. 아직 못 읽었으면 null → 화면에는 좌표를 대신 보여준다. */
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // ── 핀 위치 → 주소 ────────────────────────────────────────
  //   예전에는 좌표만 저장해서 사용자가 제안한 장소는 `address_text`가 항상 비었다.
  //   그 결과 장소 상세에서 주소 줄과 '지도앱 열기'·'주소 복사'가 통째로 사라졌다.
  const addressSeqRef = useRef(0);
  useEffect(() => {
    // 핀이 움직인 순간 이전 주소는 틀린 값이 된다. 옛 주소를 남겨두느니 좌표를 보여준다.
    setResolvedAddress(null);
    const seq = ++addressSeqRef.current;
    const timer = setTimeout(async () => {
      const found = await lookupAddress(pinLocation.latitude, pinLocation.longitude);
      // 늦게 도착한 옛 응답이 새 위치의 주소를 덮어쓰지 않도록
      if (seq !== addressSeqRef.current) return;
      setResolvedAddress(found?.addressText ?? null);
    }, ADDRESS_LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pinLocation.latitude, pinLocation.longitude]);

  // ── 초기 중복 검사 ────────────────────────────────────────
  useEffect(() => {
    // 0.6초 로딩 후 form으로 (이름/카테고리 미입력 상태에서는 중복 검사 의미 없음)
    // 실제 중복 검사는 폼 제출 직전에 수행
    track(EVENT.place_suggestion_start, {
      screen_name: 'suggest_spot',
      source_screen: typeof from === 'string' ? from : undefined,
    });
    const timer = setTimeout(() => setStep('form'), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 폼 유효성 ─────────────────────────────────────────────
  // 설명은 선택 — 산책 중 한 손으로 등록하는 상황이 기본이라, 필수로 두면 등록 자체를 포기한다.
  // 이름·카테고리·좌표만 있으면 장소로서 성립하고, 설명은 나중에 채울 수 있다.
  const isFormValid = useMemo(
    () => name.trim().length > 0 && !!category,
    [name, category],
  );

  // ── 태그 토글 ──────────────────────────────────────────────
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  }, []);

  // ── 사진 선택 ──────────────────────────────────────────────
  // 갤러리에서 1장 선택 → 미리보기. 실 환경에서는 Supabase Storage에 업로드 후
  // cover_image_url로 사용 (현재 단계는 URI만 보관, 업로드는 store/edge function에서)
  const handlePickPhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(PERM.photo, '권한 필요');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (!result.canceled && result.assets[0]) {
        // 제안 사진은 검토를 거쳐 장소 페이지에 공개될 수 있다 — 촬영 좌표를 지우고 들고 간다.
        setPhotoUri(await stripExif(result.assets[0].uri));
      }
    } catch {
      toast.error(PHOTO.loadFailed);
    }
  }, []);
  const handleRemovePhoto = useCallback(() => setPhotoUri(null), []);

  // ── 제출 전 중복 검사 ─────────────────────────────────────
  const handleCheckDuplicates = useCallback(() => {
    if (!isFormValid) return;
    const nearby = getNearbyDuplicates(pinLocation.latitude, pinLocation.longitude, name, category);
    if (nearby.length === 0) {
      handleSubmit();
      return;
    }
    const blocked = nearby.some(d => d.is_hard_block);
    setDuplicates(nearby);
    setHasHardBlock(blocked);
    setSelectedDupId(nearby.length === 1 ? nearby[0].spot_id : (blocked ? nearby.find(d => d.is_hard_block)?.spot_id ?? null : null));
    setStep('duplicate_check');
  }, [isFormValid, name, category, pinLocation, getNearbyDuplicates]);

  // ── 최종 제출 ─────────────────────────────────────────────
  const submittingRef = useRef(false);
  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;  // 더블탭 이중 제안·이중 임시스팟 방지
    submittingRef.current = true;
    try {
    // UGC 텍스트 사전 필터 (Apple 1.2) — 제안한 장소명/설명은 전체에게 노출됨
    // 입력 문제는 해당 칸 아래에서 알린다(§2.1-1) — 입력 화면으로 되돌려 보여준다
    const nextBlocked = { name: isObjectionable(name), description: isObjectionable(description) };
    setBlocked(nextBlocked);
    if (nextBlocked.name || nextBlocked.description) {
      setStep('form');
      return;
    }

    // hard_block 안전망 — duplicate_check 단계에서 우회되더라도 최종 제출 직전 재검증
    if (hasHardBlock) {
      // 중복 확인 화면이 이유와 다음 행동을 이미 상시 표시한다 — 모달로 겹치지 않는다
      setStep('duplicate_check');
      return;
    }

    // 사진은 반드시 먼저 스토리지에 올린다.
    //   예전에는 photoUri(기기 로컬 file:// 경로)를 그대로 DB에 넣었는데,
    //   그 값은 다른 기기에서 열리지 않고 승인 시 공개 장소의 커버 이미지로 복사돼
    //   모두에게 깨진 이미지가 된다. 업로드 실패는 제안 자체를 막지 않고 사진만 포기한다.
    let coverImageUrl: string | undefined;
    if (photoUri && IS_REAL_AUTH) {
      try {
        const up = await uploadImage({ bucket: 'spot-suggestions', uri: photoUri });
        coverImageUrl = up.url;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[suggest-spot] 사진 업로드 실패 — 사진 없이 제안을 이어갑니다:', e);
        // 제안은 그대로 진행된다 → 흐름을 끊지 않는다
        toast.error('사진만 올리지 못했어요. 장소 제안은 그대로 접수돼요');
      }
    }

    // 화면에서 이미 읽어둔 주소를 쓰고, 아직 없으면 여기서 한 번 더 시도한다.
    //   (핀을 옮기자마자 제출하면 디바운스가 끝나기 전이라 비어 있을 수 있다)
    const geo = resolvedAddress
      ? { addressText: resolvedAddress, neighborhood: extractNeighborhood(resolvedAddress) }
      : await lookupAddress(pinLocation.latitude, pinLocation.longitude);

    const payload = {
      name: name.trim(),
      description: description.trim(),
      category,
      additional_tags: selectedTags,
      latitude: pinLocation.latitude,
      longitude: pinLocation.longitude,
      address_text: geo?.addressText,
      cover_image_url: coverImageUrl,   // 업로드된 public URL만 (로컬 경로 금지)
    };

    // 서버가 발급한 진짜 spot_id. 이게 있어야 발도장·상세 조회가 동작한다.
    let serverSpotId: string | null = null;

    if (IS_REAL_AUTH && user) {
      // 1) 먼저 spots에 임시 장소(hidden)를 만든다.
      //    예전에는 spot_suggestions만 넣고 spot_id는 로컬에서 `spot_user_<ts>`로 지어냈는데,
      //    spots.spot_id는 uuid라 그 값으로는 조회조차 되지 않아 제안 직후 발도장이 항상
      //    404로 실패했다. hidden이라 검토 전까지 남에게는 보이지 않는다.
      //
      //    suggested_by_user_id는 반드시 넣는다 — RLS가 이 값으로 소유자를 판정한다.
      //    빠지면 INSERT 자체가 42501로 거부된다(정책이 소유자 일치를 요구).
      //
      const { data: spotRow, error: spotError } = await supabase
        .from('spots')
        .insert({
          name: payload.name,
          category: payload.category,
          latitude: payload.latitude,
          longitude: payload.longitude,
          address_text: payload.address_text ?? null,
          neighborhood: geo?.neighborhood ?? null,
          description: payload.description || null,
          tags: payload.additional_tags,
          cover_image_url: payload.cover_image_url ?? null,
          status: 'hidden',
          created_source: 'user_suggested',
          suggested_by_user_id: user.user_id,
        })
        .select('spot_id')
        .single();

      if (spotError || !spotRow) {
        track(EVENT.place_suggestion_submit_failed, { screen_name: 'suggest_spot' });
        toast.error('장소를 제안하지 못했어요. 잠시 후 다시 시도해주세요');
        return;
      }
      serverSpotId = spotRow.spot_id;

      // 2) 검토 큐에 올릴 제안 레코드 — 임시 장소와 연결해둔다(승인 시 active로 전환).
      const { error } = await supabase
        .from('spot_suggestions')
        .insert({
          dog_id: user.dog_id,
          user_id: user.user_id,
          name: payload.name,
          description: payload.description,
          category: payload.category,
          additional_tags: payload.additional_tags,
          latitude: payload.latitude,
          longitude: payload.longitude,
          cover_image_url: payload.cover_image_url ?? null,
          provisional_spot_id: serverSpotId,
        });

      if (error) {
        // 제안 레코드가 안 만들어졌으면 임시 장소만 남아 검토 큐에 잡히지 않는 유령이 된다.
        // 방금 내가 만든 hidden 행이라 RLS상 지울 수 있다(실패해도 사용자 흐름엔 영향 없음).
        await supabase.from('spots').delete().eq('spot_id', serverSpotId);
        track(EVENT.place_suggestion_submit_failed, { screen_name: 'suggest_spot' });
        toast.error('장소를 제안하지 못했어요. 잠시 후 다시 시도해주세요');
        return;
      }
    }

    // 로컬 store에도 반영 (즉각적인 UI 피드백). 서버 id가 있으면 그걸 쓴다.
    const newSpotId = suggestSpot(payload, serverSpotId);
    track(EVENT.place_suggestion_submitted, {
      screen_name: 'suggest_spot',
      place_id: newSpotId,
      place_category: payload.category,
      tag_count: payload.additional_tags?.length ?? 0,
    });
    setCreatedSpotId(newSpotId);
    setStep('done');
    } finally {
      submittingRef.current = false;
    }
  }, [name, description, category, selectedTags, pinLocation, suggestSpot, user, hasHardBlock, photoUri, resolvedAddress]);

  // ── 기존 장소 사용 ────────────────────────────────────────
  const handleUseExistingSpot = useCallback((spotId: string) => {
    if (from === 'paw') {
      // 발도장 플로우로 해당 장소를 선택한 상태로 이동
      // pawFlow.selectedSpot 세팅 → paw-checkin이 step 1 건너뛰고 step 2로 시작
      const card = getHomeCards().find(c => c.spot_id === spotId);
      if (card) setPawSpot(card);
      router.replace('/paw-checkin');
    } else {
      router.replace(`/spot/${spotId}`);
    }
  }, [from, router, getHomeCards, setPawSpot]);

  return (
    <SafeAreaView style={s.safe}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => {
            if (step === 'duplicate_check') setStep('form');
            else router.back();
          }}
        >
          <Icon
            name={step === 'done' ? 'close' : 'back'}
            size={22}
            color={Colors.text.primary}
          />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {step === 'done' ? '제안 완료' : '장소 제안'}
        </Text>
        <View style={s.headerBtn} />
      </View>

      {/* ── CHECKING ── */}
      {step === 'checking' && (
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
          <Text style={s.checkingText}>주변 장소를 확인하는 중...</Text>
        </View>
      )}

      {/* ── DUPLICATE CHECK ──
          예전엔 후보마다 '이 장소 사용하기'가 붙고, 화면 맨 아래에 '그래도 새 장소 제안하기'가
          따로 있었다. 위계가 같은 두 갈래를 서로 다른 자리에 흩어놓아 무엇을 해야 하는지가
          읽히지 않았다. 목록은 '고르는 곳', 하단 바는 '정하는 곳'으로 역할을 나눈다. */}
      {step === 'duplicate_check' && (
        <>
          <ScrollView style={s.scroll} contentContainerStyle={s.dupContent} showsVerticalScrollIndicator={false}>
            <View style={s.dupHeader}>
              <View style={s.dupIconWrap}>
                <Icon name="map" size={28} color={Colors.brand.primary} />
              </View>
              <Text style={s.dupTitle}>비슷한 장소가 있어요</Text>
              <Text style={s.dupDesc}>
                {hasHardBlock
                  ? '같은 장소가 이미 등록되어 있어요. 아래에서 골라주세요.'
                  : '이미 있는 곳이면 골라주세요. 다른 곳이면 새로 등록할 수 있어요.'}
              </Text>
            </View>

            <View style={s.dupList}>
              {duplicates.map(dup => {
                const selected = dup.spot_id === selectedDupId;
                return (
                  <TouchableOpacity
                    key={dup.spot_id}
                    style={[s.dupCard, selected && s.dupCardSelected]}
                    onPress={() => setSelectedDupId(dup.spot_id)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={[s.dupRadio, selected && s.dupRadioOn]}>
                      {selected && <Icon name="check" size={13} color="#FFFFFF" />}
                    </View>
                    <View style={s.dupCardInfo}>
                      <Text style={s.dupName} numberOfLines={1}>{dup.name}</Text>
                      <Text style={s.dupMeta}>
                        {dup.category_label} · {dup.distance_m}m 거리
                      </Text>
                    </View>
                    {dup.is_hard_block && (
                      <View style={s.blockBadge}>
                        <Text style={s.blockBadgeText}>동일 장소</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {hasHardBlock && (
              <View style={s.hardBlockNotice}>
                <Icon name="warning" size={16} color={Colors.status.error.text} />
                <Text style={s.hardBlockText}>
                  이름·카테고리가 같은 장소가 10m 안에 있어 새로 등록할 수는 없어요.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* 두 갈래를 한 줄에 나란히. 무엇을 고르든 여기서 끝난다. */}
          <View style={s.dupFooter}>
            <Button
              label="새 장소로 등록"
              onPress={handleSubmit}
              variant="secondary"
              size="l"
              disabled={hasHardBlock}
              style={s.dupFooterBtn}
            />
            <Button
              label="이 장소 사용"
              onPress={() => selectedDupId && handleUseExistingSpot(selectedDupId)}
              variant="primary"
              size="l"
              disabled={!selectedDupId}
              style={s.dupFooterBtnPrimary}
            />
          </View>
        </>
      )}

      {/* ── FORM ── */}
      {step === 'form' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── 위치 ── */}
            <View style={s.formSection}>
              <View style={s.formSectionTitleRow}>
                <Text style={s.formSectionTitle}>위치 확인 <Text style={s.required}>*</Text></Text>
              </View>
              <Text style={s.mapHint}>지도를 움직여 핀을 정확한 위치에 맞춰주세요</Text>

              <View style={s.mapWrap}>
                {/* 전 플랫폼 KakaoMap — 지도 중심 = 핀 위치 (탐색 탭과 동일 스택) */}
                <KakaoMap
                  style={s.mapView}
                  initialLatitude={location.latitude}
                  initialLongitude={location.longitude}
                  initialLevel={3}
                  userLocation={currentLocation}
                  markers={[]}
                  onRegionChange={(lat, lng) =>
                    setPinLocation({ latitude: lat, longitude: lng })
                  }
                />

                {/* 지도 중앙 고정 핀 — 모든 플랫폼 공통 */}
                <View style={s.mapPinOverlay} pointerEvents="none">
                  <Icon name="location-filled" size={40} color={Colors.brand.primary} />
                  <View style={s.mapPinDot} />
                </View>
              </View>

              {/* 핀 위치 — 주소를 읽었으면 주소를, 아직이면 좌표를 보여준다 */}
              <View style={s.coordRow}>
                <Icon name="location" size={12} color={Colors.text.tertiary} />
                <Text style={s.coordText} numberOfLines={2}>
                  {resolvedAddress ??
                    `${pinLocation.latitude.toFixed(5)}, ${pinLocation.longitude.toFixed(5)}`}
                </Text>
              </View>
            </View>

            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>장소 이름 <Text style={s.required}>*</Text></Text>
              <TextInput
                style={s.textInput}
                value={name}
                onChangeText={(t) => { setName(t); if (blocked.name) setBlocked(b => ({ ...b, name: false })); }}
                placeholder="예) 한강 뚝섬지구"
                placeholderTextColor={Colors.text.tertiary}
                maxLength={40}
              />
              {blocked.name && <Text style={s.fieldError}>{MODERATION_BLOCK_MESSAGE}</Text>}
            </View>

            {/* ── 대표 사진 (선택) ── */}
            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>대표 사진 <Text style={s.optional}>(선택)</Text></Text>
              <Text style={s.photoHint}>장소 분위기를 잘 보여주는 사진 한 장을 첨부하면 좋아요</Text>
              {photoUri ? (
                <View style={s.photoPreviewWrap}>
                  <AppImage source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
                  <TouchableOpacity style={s.photoRemoveBtn} onPress={handleRemovePhoto} activeOpacity={0.85}>
                    <Icon name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.photoPicker} onPress={handlePickPhoto} activeOpacity={0.85}>
                  <Icon name="camera" size={22} color={Colors.brand.primary} />
                  <Text style={s.photoPickerText}>사진 선택하기</Text>
                  <Text style={s.photoPickerSub}>JPG · PNG (최대 1장)</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>카테고리 <Text style={s.required}>*</Text></Text>
              <View style={s.categoryGrid}>
                {CATEGORY_OPTIONS.map(opt => {
                  const active = category === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.categoryChip, active && s.categoryChipActive]}
                      onPress={() => setCategory(opt.key)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.categoryChipText, active && s.categoryChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>한 줄 설명 <Text style={s.optional}>(선택)</Text></Text>
              <TextInput
                style={[s.textInput, s.textInputMulti]}
                value={description}
                onChangeText={(t) => { setDescription(t); if (blocked.description) setBlocked(b => ({ ...b, description: false })); }}
                placeholder="그늘이 많아요, 바닥이 흙이에요 같은 한마디"
                placeholderTextColor={Colors.text.tertiary}
                multiline
                maxLength={80}
                numberOfLines={2}
              />
              {blocked.description
                ? <Text style={s.fieldError}>{MODERATION_BLOCK_MESSAGE}</Text>
                : <Text style={s.charCount}>{description.length}/80</Text>}
            </View>

            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>추가 태그 <Text style={s.optional}>(선택)</Text></Text>
              <View style={s.tagGrid}>
                {TAG_OPTIONS.map(tag => {
                  const active = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[s.tagChip, active && s.tagChipActive]}
                      onPress={() => toggleTag(tag)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.tagChipText, active && s.tagChipTextActive]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.guideBox}>
              <Icon name="info" size={14} color={Colors.text.tertiary} />
              <Text style={s.guideText}>
                제안하신 장소는 검토 후 앱에 반영돼요.{'\n'}
                검토 전까지는 나에게만 임시로 표시될 수 있어요.
              </Text>
            </View>
          </ScrollView>

          <View style={s.footer}>
            <Button
              label={isFormValid ? '장소 제안하기' : '필수 항목을 입력해 주세요'}
              onPress={handleCheckDuplicates}
              variant="primary"
              size="l"
              fullWidth
              disabled={!isFormValid}
            />
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <>
          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <View style={s.doneCenter}>
              <View style={s.doneIconCircle}>
                <Icon name="paw-filled" size={40} color={Colors.brand.primary} />
              </View>
              <Text style={s.doneTitle}>제안해 주셔서 감사해요</Text>
              <Text style={s.doneDesc}>
                검토가 끝나면 앱에 정식으로 등록돼요.{'\n'}
                완료 시 알림으로 알려드릴게요.
              </Text>
            </View>

            <View style={[s.tempNoticeBox, Shadow.s]}>
              <View style={s.tempNoticeTitleRow}>
                <Icon name="info" size={15} color={Colors.brand.accent} />
                <Text style={s.tempNoticeTitle}>임시 반영 안내</Text>
              </View>
              <Text style={s.tempNoticeDesc}>
                제안하신 장소는 검토 전까지 <Text style={s.tempNoticeEm}>임시 반영</Text> 상태로
                표시돼요. 발도장 찍기, 장소 저장 등 일부 기능을 미리 쓸 수 있지만,
                검토 결과에 따라 변경될 수 있어요.
              </Text>
            </View>

            <View style={s.doneSummaryCard}>
              <DoneSummaryRow label="장소 이름" value={name} />
              <DoneSummaryRow label="카테고리"  value={CATEGORY_OPTIONS.find(o => o.key === category)?.label ?? category} />
              {description.trim().length > 0 && <DoneSummaryRow label="설명" value={description} />}
            </View>
          </ScrollView>

          {/* 등록을 마친 뒤 갈 곳은 두 갈래다 — 바로 발도장을 찍거나, 등록만 하고 끝내거나.
              예전에는 발도장 플로우(from==='paw')로 들어온 경우에만 선택지가 있었고,
              직접 장소를 제안한 사용자는 "확인" 하나로 되돌아갈 뿐이라
              방금 만든 장소에 발도장을 찍을 길이 없었다. */}
          {/* 한 줄. 위아래로 쌓을 만큼 위계가 다른 선택지가 아니다. */}
          <View style={[s.footer, s.doneFooter]}>
            <Button
              label="닫기"
              onPress={() => {
                resetPawFlow();
                if (createdSpotId) {
                  router.dismissTo('/(tabs)');
                  router.push(`/spot/${createdSpotId}`);
                } else {
                  router.back();
                }
              }}
              variant="secondary"
              size="l"
              style={s.doneBtn}
            />
            <Button
              label="발도장 찍기"
              onPress={() => {
                if (createdSpotId) {
                  const card = getHomeCards().find(c => c.spot_id === createdSpotId);
                  if (card) setPawSpot(card);
                }
                // 이 화면에 오는 길은 발도장 화면뿐이다 — 그 화면은 이미 스택 아래에 있다.
                // replace로 새 발도장 화면을 얹으면 스택이 [발도장, 발도장]이 되어,
                // 발도장을 마치고 뒤로 갔을 때 낡은 발도장 화면이 다시 뜬다.
                setPawStep(2);
                if (router.canGoBack()) router.back();
                else router.replace('/paw-checkin');
              }}
              variant="primary"
              size="l"
              style={s.doneBtnPrimary}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

// ─── 완료 요약 행 ────────────────────────────────────────────
function DoneSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ds.row}>
      <Text style={ds.label}>{label}</Text>
      <Text style={ds.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[14],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    backgroundColor: Colors.bg.primary,
  },
  headerBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.s, color: Colors.text.primary },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[16] },
  checkingText: { ...Typography.body.m, color: Colors.text.secondary },

  scroll:  { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: Spacing[40], gap: Spacing[24] },

  // ── Duplicate check ──
  dupHeader: { alignItems: 'center', gap: Spacing[10] },
  dupIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.border.brand,
  },
  dupTitle: { ...Typography.title.m, color: Colors.text.primary, textAlign: 'center' },
  dupDesc:  { ...Typography.body.m, color: Colors.text.secondary, textAlign: 'center' },

  dupList: { gap: Spacing[10] },
  dupContent: { paddingBottom: Spacing[16] },
  dupRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  dupRadioOn: { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },
  dupCardSelected: { borderColor: Colors.brand.primary, backgroundColor: Colors.brand.subtle },
  dupFooter: {
    flexDirection: 'row', gap: Spacing[8],
    paddingHorizontal: Spacing[16], paddingTop: Spacing[12], paddingBottom: Spacing[16],
    borderTopWidth: 1, borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.bg.primary,
  },
  dupFooterBtn: { flex: 1 },
  dupFooterBtnPrimary: { flex: 1.2 },

  dupCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    padding: Spacing[16],
  },
  dupCardBlock: { borderColor: Colors.status.error.border, backgroundColor: Colors.status.error.bg },
  dupCardMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing[12] },
  dupCardInfo: { flex: 1, gap: Spacing[4] },
  dupName: { ...Typography.label.l, color: Colors.text.primary, fontWeight: '600' },
  dupMeta: { ...Typography.body.s, color: Colors.text.tertiary },
  blockBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing[4],
    paddingHorizontal: Spacing[8], paddingVertical: Spacing[4],
    backgroundColor: Colors.status.error.bg,
    borderRadius: Radius.round,
    borderWidth: 1, borderColor: Colors.status.error.border,
  },
  blockBadgeText: { ...Typography.label.s, color: Colors.status.error.text },

  useSpotBtn: {
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[10],
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.m,
  },
  useSpotBtnStrong: {
    backgroundColor: Colors.brand.secondary, // hard_block은 더 짙은 강조
  },
  useSpotBtnText: { ...Typography.label.s, color: Colors.brand.onPrimary, fontWeight: '700' },

  hardBlockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[8],
    padding: Spacing[16],
    backgroundColor: Colors.status.error.bg,
    borderRadius: Radius.m,
    borderWidth: 1,
    borderColor: Colors.status.error.border,
  },
  hardBlockText: { flex: 1, ...Typography.body.s, color: Colors.status.error.text, lineHeight: 20 },

  forceSubmitBtn: {
    alignSelf: 'center',
    paddingHorizontal: Spacing[24], paddingVertical: Spacing[14],
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.brand.primary,
  },
  forceSubmitText: { ...Typography.label.m, color: Colors.brand.accent, fontWeight: '600' },

  // ── Form ──
  formSection: { gap: Spacing[10] },
  formSectionTitle: { ...Typography.label.m, color: Colors.text.primary, fontWeight: '600' },
  required:         { color: Colors.brand.primary },

  // 사진 첨부
  photoHint: { ...Typography.caption, color: Colors.text.tertiary, marginTop: -Spacing[4] },
  photoPicker: {
    height: 120,
    borderRadius: Radius.l,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border.brand,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
  },
  photoPickerText: { ...Typography.label.l, color: Colors.brand.primary, fontWeight: '700' },
  photoPickerSub:  { ...Typography.caption, color: Colors.text.tertiary },
  photoPreviewWrap: {
    width: '100%',
    height: 180,
    borderRadius: Radius.l,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
    position: 'relative',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoRemoveBtn: {
    position: 'absolute',
    top: Spacing[8],
    right: Spacing[8],
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  optional:         { ...Typography.body.s, color: Colors.text.tertiary, fontWeight: '400' },

  textInput: {
    paddingHorizontal: Spacing[16],
    paddingVertical: Spacing[14],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.m,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
    ...Typography.body.m,
    color: Colors.text.primary,
  },
  textInputMulti: { minHeight: 72, textAlignVertical: 'top' },
  charCount: { ...Typography.caption, color: Colors.text.tertiary, alignSelf: 'flex-end' },
  fieldError: { ...Typography.label.s, color: Colors.status.error.text, marginTop: Spacing[6], letterSpacing: 0 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[8] },
  categoryChip: {
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[10],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  categoryChipActive:     { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },
  categoryChipText:       { ...Typography.label.s, color: Colors.text.secondary },
  categoryChipTextActive: { color: Colors.brand.onPrimary, fontWeight: '700' },

  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[8] },
  tagChip: {
    paddingHorizontal: Spacing[14], paddingVertical: Spacing[10],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.round,
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  tagChipActive:     { backgroundColor: Colors.surface.selected, borderColor: Colors.brand.primary },
  tagChipText:       { ...Typography.label.s, color: Colors.text.secondary },
  tagChipTextActive: { color: Colors.brand.accent, fontWeight: '600' },

  guideBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[8],
    padding: Spacing[14],
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.m,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  guideText: { flex: 1, ...Typography.body.s, color: Colors.text.tertiary, lineHeight: 20 },

  // ── 위치 맵 ──
  formSectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapHint: { ...Typography.body.s, color: Colors.text.tertiary, marginTop: -4 },
  mapWrap: {
    height: 210,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1.5,
    borderColor: Colors.border.brand,
    position: 'relative',
  },
  mapView: { flex: 1 },
  mapPinOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  mapPinDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.primary,
    opacity: 0.5,
    marginTop: -4,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingTop: Spacing[6],
  },
  // flex:1 — 주소가 한 줄을 넘으면 행 밖으로 밀려나가지 않고 접혀야 한다(좌표는 항상 한 줄)
  coordText: { ...Typography.caption, color: Colors.text.tertiary, flex: 1 },

  // ── Done ──
  doneCenter: { alignItems: 'center', gap: Spacing[12], paddingTop: Spacing[8] },
  doneIconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.border.brand,
  },
  doneTitle: { ...Typography.display.s, color: Colors.text.primary, textAlign: 'center' },
  doneDesc:  {
    ...Typography.body.m,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },

  tempNoticeBox: {
    padding: Spacing[16],
    backgroundColor: Colors.brand.subtle,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border.brand,
    gap: Spacing[10],
  },
  tempNoticeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[6] },
  tempNoticeTitle: { ...Typography.label.m, color: Colors.brand.accent, fontWeight: '700' },
  tempNoticeDesc:  { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },
  tempNoticeEm:    { color: Colors.brand.accent, fontWeight: '700' },

  doneSummaryCard: {
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
  },
  // 완료 화면은 버튼이 둘(발도장 찍기 / 등록만 하고 끝내기)이라 간격이 필요하다
  doneFooter: { flexDirection: 'row', gap: Spacing[8] },
  doneBtn: { flex: 1 },
  doneBtnPrimary: { flex: 1.2 },
});

const ds = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[16], paddingVertical: Spacing[14],
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
    gap: Spacing[12], alignItems: 'flex-start',
  },
  label: { ...Typography.label.m, color: Colors.text.tertiary, width: 72 },
  value: { flex: 1, ...Typography.body.m, color: Colors.text.primary },
});
