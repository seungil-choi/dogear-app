/**
 * 장소 사진 전체 보기
 *
 * 장소 상세는 앞 12장만 보여준다. 여기는 전량을 페이지 단위로 이어 붙인다.
 *
 * ⚠️ **강아지 이름을 붙이지 않는다.** 누가 다녀갔는지는 상세의 '다녀간 강아지'가 답한다.
 *    이름을 떼야 spot_only("장소 분위기에만 기여")로 올린 사진도 공개범위를 어기지 않는다.
 *
 * 사진은 사전 검수 없이 올라오므로, 길게 누르면 신고(내 사진이면 삭제)가 뜬다 — Apple UGC 1.2.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Pressable, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../../../src/constants/tokens';
import { Icon } from '../../../src/components/common/Icon';
import { AppImage } from '../../../src/components/common/AppImage';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { supabase } from '../../../src/lib/supabase';
import { useAppStore } from '../../../src/store/useAppStore';
import { actionSheet, confirm } from '../../../src/utils/dialog';
import { toast } from '../../../src/utils/toast';
import { PHOTO } from '../../../src/constants/messages';

const PAGE_SIZE = 30;
const COLS = 3;

interface Photo {
  photo_id: string;
  image_url: string;
  created_at: string;
  is_mine: boolean;
}

export default function SpotPhotosScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeDog = useAppStore(s => s.activeDog);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const load = useCallback(async (offset: number) => {
    // 서버가 이미 공개범위·차단·검수 상태를 걸러 내려준다.
    // 클라가 직접 checkin_photos를 읽지 않는 이유 — RLS는 본인 사진만 열어주고,
    // 공개 갤러리 조립은 service_role인 엣지 함수의 몫이다.
    const { data, error } = await supabase.functions.invoke('spot-photos', {
      body: { spotId: id, dogId: activeDog?.dog_id ?? null, offset, limit: PAGE_SIZE },
    });
    if (error) {
      toast.error('사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요');
      return [];
    }
    return (data?.items ?? []) as Photo[];
  }, [id, activeDog]);

  useEffect(() => {
    (async () => {
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

  /** 길게 누르기 — 내 사진은 삭제, 남의 사진은 신고 */
  const onLongPress = useCallback(async (p: Photo) => {
    if (p.is_mine) {
      const idx = await actionSheet('내 사진', [{ label: '사진 삭제', destructive: true }]);
      if (idx !== 0) return;
      if (!(await confirm(PHOTO.deleteConfirm, {
        title: '이 사진을 삭제할까요?', confirmText: '삭제', destructive: true,
      }))) return;
      const { error } = await supabase.functions.invoke('delete-checkin-photo', {
        body: { photoId: p.photo_id },
      });
      if (error) { toast.error('사진을 삭제하지 못했어요. 잠시 후 다시 시도해주세요'); return; }
      setPhotos(prev => prev.filter(x => x.photo_id !== p.photo_id));
      toast.success(PHOTO.deleted);
      return;
    }
    const idx = await actionSheet('사진', [{ label: '신고하기', destructive: true }]);
    if (idx === 0) router.push(`/report?targetType=checkin_photo&targetId=${p.photo_id}` as never);
  }, [router]);

  const w = Dimensions.get('window').width;
  const cell = (w - Spacing[16] * 2 - Spacing[4] * (COLS - 1)) / COLS;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>사진</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing[40] }} color={Colors.brand.primary} />
      ) : photos.length === 0 ? (
        <EmptyState
          headline="아직 사진이 없어요"
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
              onLongPress={() => onLongPress(item)}
              accessibilityRole="image"
              accessibilityLabel={item.is_mine ? '내 강아지 사진. 길게 누르면 삭제' : '사진. 길게 누르면 신고'}
            >
              <AppImage source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </TouchableOpacity>
          )}
        />
      )}

      {/* 전체화면 뷰어 — 좌우로 넘긴다 */}
      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={s.viewerBackdrop} onPress={() => setViewer(null)}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={p => p.photo_id}
            initialScrollIndex={viewer ?? 0}
            getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={{ width: w, justifyContent: 'center' }}>
                <AppImage source={{ uri: item.image_url }} style={{ width: w, aspectRatio: 1 }} resizeMode="contain" />
              </View>
            )}
          />
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewer(null)} hitSlop={12} accessibilityLabel="닫기">
            <Icon name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
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
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 48, right: 20, padding: Spacing[6] },
});
