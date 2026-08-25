/**
 * 내 갤러리 — 내가 올린 발도장 사진 전부
 *
 * 왜 필요했나:
 *   사진을 올릴 수는 있는데 **모아 보거나 관리할 자리가 없었다.**
 *   내 사진을 지우려면 그 사진을 올린 장소를 기억해내 상세로 들어가 길게 눌러야 했다.
 *   장소를 잊으면 방법이 없다.
 *
 * 왜 '사진 상세' 화면을 따로 두지 않았나:
 *   갤러리에서 사진은 쭉 넘겨보는 물건이다. 상세를 별도 화면으로 두면 한 장 보려고
 *   두 번 진입해야 하고, 옆 사진으로 넘어갈 수 없다. 전체화면 뷰어에 정보 바를 얹었다.
 *
 * ⚠️ 공개 범위는 **발도장 단위**다(사진 단위가 아니다).
 *    한 발도장에 사진이 최대 3장이라, 바꾸면 그 발도장의 사진이 함께 바뀐다.
 *    확인창에서 이 사실을 반드시 말한다 — 안 하면 "이 사진만 숨긴 줄" 안다.
 *
 * 조회는 RLS를 그대로 탄다(checkin_photos_own_select). 남의 사진은 애초에 안 나온다.
 * 삭제만 엣지 함수로 간다 — 스토리지·대표사진·검수큐까지 함께 정리해야 하기 때문이다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Pressable, Dimensions, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { AppImage } from '../src/components/common/AppImage';
import { EmptyState } from '../src/components/common/EmptyState';
import { supabase } from '../src/lib/supabase';
import { useAppStore } from '../src/store/useAppStore';
import { actionSheet, confirm } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { PHOTO } from '../src/constants/messages';
import { visibilityLabel } from '../src/utils/labels';
import type { VisibilityLevel } from '../src/types';

const PAGE_SIZE = 30;
const COLS = 3;

/** 공개 범위 변경지 — privacy-settings와 같은 순서·문구 */
const LEVELS: VisibilityLevel[] = ['private', 'spot_only', 'familiar_layer'];

interface GalleryPhoto {
  photo_id: string;
  image_url: string;
  created_at: string;
  spot_id: string;
  spot_name: string | null;
  checkin_id: string;
  note: string | null;
  visibility: VisibilityLevel;
}

/**
 * PostgREST 임베드는 **객체와 배열 둘 다** 올 수 있다(관계 카디널리티 추론에 따라).
 * 한쪽만 가정하면 어느 날 조용히 null이 된다.
 */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function MyGalleryScreen() {
  const router = useRouter();
  const dogs = useAppStore(s => s.dogs);
  // Modal은 SafeAreaView 바깥이라 인셋이 자동으로 안 먹는다.
  // 안 넣으면 안드로이드 하단 내비게이션 바가 정보 바 위에 겹쳐 버튼을 누를 수 없다.
  const insets = useSafeAreaInsets();
  const dogIds = useMemo(() => dogs.map(d => d.dog_id), [dogs]);

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [editing, setEditing] = useState<GalleryPhoto | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async (offset: number): Promise<GalleryPhoto[]> => {
    if (dogIds.length === 0) return [];
    const { data, error } = await supabase
      .from('checkin_photos')
      // ⚠️ FK 이름을 반드시 명시한다. checkin_photos↔spots 사이에 관계가 **두 개**라
      //    (checkin_photos.spot_id → spots / spots.representative_photo_id → checkin_photos)
      //    그냥 `spots(name)`이라고 쓰면 PostgREST가 PGRST201로 거부한다.
      .select(
        'id, image_url, created_at, spot_id, checkin_id,' +
        'spots!checkin_photos_spot_id_fkey(name),' +
        'paw_checkins!checkin_photos_checkin_id_fkey(note, visibility_level)',
      )
      .in('dog_id', dogIds)
      // status는 'visible' | 'hidden' 두 값이다('active'가 아니다 —
      // spots.status와 헷갈리기 쉽다. CHECK 제약이 이 둘만 허용한다).
      .eq('status', 'visible')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      toast.error('사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요');
      return [];
    }
    return (data ?? []).map((r: any) => {
      const spot = one<{ name: string }>(r.spots);
      const ci = one<{ note: string | null; visibility_level: VisibilityLevel }>(r.paw_checkins);
      return {
        photo_id: r.id,
        image_url: r.image_url,
        created_at: r.created_at,
        spot_id: r.spot_id,
        // 장소가 숨김·병합되면 조인이 비어 온다. 화면이 깨지지 않게 null을 그대로 다룬다.
        spot_name: spot?.name ?? null,
        checkin_id: r.checkin_id,
        note: ci?.note ?? null,
        visibility: ci?.visibility_level ?? 'spot_only',
      };
    });
  }, [dogIds]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const first = await load(0);
      setPhotos(first);
      setDone(first.length < PAGE_SIZE);
      setLoading(false);
    })();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || done || loading) return;
    setLoadingMore(true);
    const next = await load(photos.length);
    setPhotos(prev => [...prev, ...next]);
    if (next.length < PAGE_SIZE) setDone(true);
    setLoadingMore(false);
  }, [loadingMore, done, loading, photos.length, load]);

  // ── 삭제 ──────────────────────────────────────────────────
  const handleDelete = useCallback(async (p: GalleryPhoto) => {
    if (!(await confirm(PHOTO.deleteConfirm, {
      title: '이 사진을 삭제할까요?', confirmText: '삭제', destructive: true,
    }))) return;
    const { error } = await supabase.functions.invoke('delete-checkin-photo', {
      body: { photoId: p.photo_id },
    });
    if (error) { toast.error('사진을 삭제하지 못했어요. 잠시 후 다시 시도해주세요'); return; }
    setPhotos(prev => prev.filter(x => x.photo_id !== p.photo_id));
    setViewer(null);
    toast.success(PHOTO.deleted);
  }, []);

  // ── 공개 범위 ─────────────────────────────────────────────
  const handleVisibility = useCallback(async (p: GalleryPhoto) => {
    const others = photos.filter(x => x.checkin_id === p.checkin_id).length;
    const idx = await actionSheet(
      '이 발도장의 공개 범위',
      LEVELS.map(l => ({ label: l === p.visibility ? `${visibilityLabel[l]} (지금)` : visibilityLabel[l] })),
    );
    if (idx < 0) return;
    const next = LEVELS[idx];
    if (next === p.visibility) return;

    // 발도장 단위라는 사실을 숨기지 않는다
    const scope = others > 1
      ? `이 발도장에 올린 사진 ${others}장이 함께 바뀌어요.`
      : '이 사진이 붙은 발도장의 공개 범위가 바뀌어요.';
    if (!(await confirm(`${scope}\n${visibilityLabel[next]}로 바꿀까요?`, {
      title: '공개 범위를 바꿀까요?', confirmText: '변경',
    }))) return;

    const { error } = await supabase
      .from('paw_checkins')
      .update({ visibility_level: next })
      .eq('checkin_id', p.checkin_id);
    if (error) { toast.error('공개 범위를 바꾸지 못했어요. 잠시 후 다시 시도해주세요'); return; }

    setPhotos(prev => prev.map(x =>
      x.checkin_id === p.checkin_id ? { ...x, visibility: next } : x));
    toast.success(`${visibilityLabel[next]}로 바꿨어요`);
  }, [photos]);

  // ── 메모 ─────────────────────────────────────────────────
  const saveNote = useCallback(async () => {
    if (!editing || savingNote) return;
    setSavingNote(true);
    const body = noteDraft.trim() || null;
    const { error } = await supabase
      .from('paw_checkins')
      .update({ note: body })
      .eq('checkin_id', editing.checkin_id);
    setSavingNote(false);
    if (error) { toast.error('메모를 저장하지 못했어요. 잠시 후 다시 시도해주세요'); return; }
    setPhotos(prev => prev.map(x =>
      x.checkin_id === editing.checkin_id ? { ...x, note: body } : x));
    setEditing(null);
    toast.success('메모를 저장했어요');
  }, [editing, noteDraft, savingNote]);

  const openActions = useCallback(async (p: GalleryPhoto) => {
    const idx = await actionSheet('이 사진', [
      { label: '메모 수정' },
      { label: '공개 범위' },
      { label: '사진 삭제', destructive: true },
    ]);
    if (idx === 0) { setNoteDraft(p.note ?? ''); setEditing(p); }
    else if (idx === 1) await handleVisibility(p);
    else if (idx === 2) await handleDelete(p);
  }, [handleVisibility, handleDelete]);

  const w = Dimensions.get('window').width;
  const cell = (w - Spacing[16] * 2 - Spacing[4] * (COLS - 1)) / COLS;
  const current = viewer != null ? photos[viewer] : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>내 갤러리</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing[40] }} color={Colors.brand.primary} />
      ) : photos.length === 0 ? (
        <EmptyState
          headline="아직 올린 사진이 없어요"
          description="발도장을 남길 때 사진을 함께 올리면 여기에 모여요."
        />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={p => p.photo_id}
          numColumns={COLS}
          contentContainerStyle={s.grid}
          columnWrapperStyle={{ gap: Spacing[4] }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing[4] }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={loadingMore
            ? <ActivityIndicator style={{ paddingVertical: Spacing[16] }} color={Colors.brand.primary} />
            : null}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={{ width: cell, height: cell, borderRadius: Radius.m, overflow: 'hidden', backgroundColor: Colors.bg.secondary }}
              activeOpacity={0.9}
              onPress={() => setViewer(index)}
              onLongPress={() => openActions(item)}
              accessibilityRole="image"
              accessibilityLabel={`${item.spot_name ?? '장소'} 사진. 길게 누르면 관리`}
            >
              <AppImage source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {/* 나만 보기는 눈에 띄어야 한다 — 공개인 줄 알고 올린 사진과 구분된다 */}
              {item.visibility === 'private' && (
                <View style={s.privateChip}>
                  <Icon name="lock" size={9} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── 전체화면 뷰어 + 정보 바 ── */}
      <Modal
        visible={viewer !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewer(null)}
      >
        <View style={s.viewerBackdrop}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={p => p.photo_id}
            initialScrollIndex={viewer ?? 0}
            getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e =>
              setViewer(Math.round(e.nativeEvent.contentOffset.x / w))}
            renderItem={({ item }) => (
              <Pressable style={{ width: w, flex: 1, justifyContent: 'center' }} onPress={() => setViewer(null)}>
                <AppImage source={{ uri: item.image_url }} style={{ width: w, aspectRatio: 1 }} resizeMode="contain" />
              </Pressable>
            )}
          />

          <TouchableOpacity
            style={[s.viewerClose, { top: insets.top + Spacing[10] }]}
            onPress={() => setViewer(null)}
            hitSlop={12}
            accessibilityLabel="닫기"
          >
            <Icon name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {current && (
            <View style={[s.infoBar, { paddingBottom: insets.bottom + Spacing[20] }]}>
              <View style={s.infoTopRow}>
                <Text style={s.infoPlace} numberOfLines={1}>
                  {current.spot_name ?? '삭제된 장소'}
                </Text>
                <Text style={s.infoDate}>{formatDate(current.created_at)}</Text>
              </View>
              <View style={s.infoChipRow}>
                <View style={s.infoChip}>
                  <Text style={s.infoChipText}>{visibilityLabel[current.visibility]}</Text>
                </View>
              </View>
              {current.note ? (
                <Text style={s.infoNote} numberOfLines={2}>{current.note}</Text>
              ) : null}
              <View style={s.infoActions}>
                {/* 장소가 사라졌으면 이동할 곳이 없다 — 버튼을 감춘다 */}
                {current.spot_name ? (
                  <TouchableOpacity
                    style={s.infoGoBtn}
                    onPress={() => { setViewer(null); router.push(`/spot/${current.spot_id}`); }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.infoGoText}>장소 보기</Text>
                    <Icon name="forward" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : <View />}
                <TouchableOpacity
                  style={s.infoMoreBtn}
                  onPress={() => openActions(current)}
                  hitSlop={8}
                  accessibilityLabel="사진 관리"
                >
                  <Icon name="more" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ── 메모 수정 ── */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setEditing(null)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setEditing(null)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + Spacing[20] }]} onPress={e => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>메모 수정</Text>
            <Text style={s.sheetDesc}>
              이 발도장에 남긴 메모예요. 공개 범위에 따라 장소 상세에 보일 수 있어요.
            </Text>
            <TextInput
              style={s.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="이 장소는 어땠나요?"
              placeholderTextColor={Colors.text.tertiary}
              multiline
              maxLength={200}
            />
            <Text style={s.noteCount}>{noteDraft.length}/200</Text>
            <TouchableOpacity
              style={[s.saveBtn, savingNote && s.saveBtnDisabled]}
              onPress={saveNote}
              disabled={savingNote}
              activeOpacity={0.88}
            >
              <Text style={s.saveBtnText}>{savingNote ? '저장 중…' : '저장'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },
  grid: { padding: Spacing[16] },

  privateChip: {
    position: 'absolute', top: 5, right: 5,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 뷰어 ────────────────────────────────────────────────
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  // top은 인셋으로 런타임에 덮어쓴다(기기마다 노치·상태바 높이가 다르다)
  viewerClose: { position: 'absolute', right: 20, padding: Spacing[6] },

  infoBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing[20], paddingTop: Spacing[16],
    // paddingBottom은 인셋으로 런타임에 덮어쓴다 — 안드로이드 내비바와 겹치면 안 된다
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  infoTopRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing[8] },
  infoPlace: { flex: 1, ...Typography.title.s, color: '#FFFFFF' },
  infoDate: { ...Typography.caption, color: 'rgba(255,255,255,0.7)' },
  infoChipRow: { flexDirection: 'row', gap: Spacing[6], marginTop: Spacing[8] },
  infoChip: {
    paddingHorizontal: Spacing[8], paddingVertical: 2,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  infoChipText: { ...Typography.label.s, color: '#FFFFFF' },
  infoNote: { ...Typography.body.s, color: 'rgba(255,255,255,0.9)', marginTop: Spacing[10], lineHeight: 20 },
  infoActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing[14],
  },
  infoGoBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  infoGoText: { ...Typography.body.s, color: '#FFFFFF', fontWeight: '600' },
  infoMoreBtn: { padding: Spacing[6] },

  // ── 메모 수정 시트 ───────────────────────────────────────
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: Radius.l, borderTopRightRadius: Radius.l,
    paddingHorizontal: Spacing[20], paddingTop: Spacing[10],
  },
  sheetHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border.strong, marginBottom: Spacing[16],
  },
  sheetTitle: { ...Typography.title.m, color: Colors.text.primary },
  sheetDesc: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[4] },
  noteInput: {
    marginTop: Spacing[16],
    minHeight: 96,
    borderWidth: 1, borderColor: Colors.border.default, borderRadius: Radius.m,
    padding: Spacing[12],
    ...Typography.body.m, color: Colors.text.primary,
    textAlignVertical: 'top',
  },
  noteCount: { ...Typography.caption, color: Colors.text.tertiary, textAlign: 'right', marginTop: Spacing[4] },
  saveBtn: {
    marginTop: Spacing[16], height: 52, borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: Colors.border.strong },
  saveBtnText: { ...Typography.title.m, color: '#FFFFFF' },
});
