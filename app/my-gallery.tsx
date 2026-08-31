/**
 * 내 사진 — 내가 올린 발도장 사진 전부
 *
 * 마이의 「사진」 섹션에서 [전체보기]로 들어온다.
 * '갤러리'라는 이름은 쓰지 않는다 — 장소 상세도 '사진'이라 부른다.
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
 * ⚠️ 공개 여부는 **강아지 설정 하나**가 정한다(2026-08-23). 사진·발도장 단위로
 *    따로 고르지 않는다 — 설정과 어긋나면 어느 쪽이 진짜인지 알 수 없게 된다.
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
import { PhotoViewer, photoViewerFooterStyles as pvf } from '../src/components/common/PhotoViewer';
import { supabase } from '../src/lib/supabase';
import { useAppStore } from '../src/store/useAppStore';
import { actionSheet, confirm } from '../src/utils/dialog';
import { toast } from '../src/utils/toast';
import { PHOTO } from '../src/constants/messages';
import type { VisibilityLevel } from '../src/types';

const PAGE_SIZE = 30;
const COLS = 3;


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
    // 공개 범위는 **강아지 설정 하나**가 전역으로 정한다(2026-08-23).
    // 사진마다 따로 고를 수 있게 두면 설정과 어긋나고, 어느 쪽이 진짜인지 흐려진다.
    const idx = await actionSheet('이 사진', [
      { label: '메모 수정' },
      { label: '사진 삭제', destructive: true },
    ]);
    if (idx === 0) { setNoteDraft(p.note ?? ''); setEditing(p); }
    else if (idx === 1) await handleDelete(p);
  }, [handleDelete]);

  const w = Dimensions.get('window').width;
  const cell = (w - Spacing[16] * 2 - Spacing[4] * (COLS - 1)) / COLS;
  const current = viewer != null ? photos[viewer] : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>내 사진</Text>
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
              {/* 예전 정책으로 '나만 보기'로 남은 사진 — 지금은 새로 만들 수 없다 */}
              {item.visibility === 'private' && (
                <View style={s.privateChip}>
                  <Icon name="lock" size={9} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── 전체화면 뷰어 ──
          조작(닫기·관리)은 헤더 한 줄에 모으고, 하단엔 읽을 것만 둔다.
          제목(장소명)을 누르면 그 장소로 간다 — 별도 '장소 보기' 버튼이 필요 없다. */}
      <PhotoViewer
        photos={photos}
        index={viewer}
        onIndexChange={setViewer}
        onClose={() => setViewer(null)}
        title={p => p.spot_name ?? '삭제된 장소'}
        subtitle={p => formatDate(p.created_at)}
        // 장소가 사라졌으면 갈 곳이 없다
        onTitlePress={p => {
          if (!p.spot_name) return;
          setViewer(null);
          router.push(`/spot/${p.spot_id}`);
        }}
        onMenu={openActions}
        renderFooter={p => (
          <>
            {/* 공개 여부는 강아지 설정이 정한다 — 여기선 결과만 알린다 */}
            <View style={pvf.chipRow}>
              <View style={pvf.chip}>
                <Text style={pvf.chipText}>
                  {p.visibility === 'private' ? '나만 보기' : '프로필 없이 공개'}
                </Text>
              </View>
            </View>
            {p.note ? <Text style={pvf.note} numberOfLines={2}>{p.note}</Text> : null}
          </>
        )}
      />

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
              이 발도장에 남긴 메모예요. 장소 상세의 '남긴 말'에 이름 없이 보일 수 있어요.
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
  // top은 인셋으로 런타임에 덮어쓴다(기기마다 노치·상태바 높이가 다르다)


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
