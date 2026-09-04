/**
 * PhotoViewer — 사진 전체화면 뷰어(공용)
 *
 * 왜 공용으로 뺐나:
 *   장소 상세 / 장소 사진 전체보기 / 내 갤러리 세 곳에 거의 같은 뷰어가 따로 있었고,
 *   배치가 조금씩 달랐다. 닫기는 우상단, 신고는 하단 가운데, 장소 정보는 또 하단 —
 *   같은 기능인데 화면마다 손이 가는 자리가 달라 "정리가 안 된" 인상을 줬다.
 *
 * 배치 규칙 (사진 앱들의 관례를 따른다):
 *   헤더 한 줄에 **조작을 모은다** — 닫기(좌) · 제목(가운데) · 더보기(우).
 *   하단은 **읽을 것만** 둔다 — 공개 범위, 메모. 버튼을 두지 않는다.
 *   제목을 누르면 그 사진의 장소로 간다(별도 '장소 보기' 버튼이 필요 없다).
 *
 * ⚠️ Modal은 SafeAreaView 바깥이라 인셋이 자동으로 안 먹는다.
 *    고정 좌표를 쓰면 안드로이드 내비게이션 바가 버튼을 덮어 **누를 수 없다**.
 */
import React, { useCallback } from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity, FlatList,
  StyleSheet, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/tokens';
import { Icon } from './Icon';
import { AppImage } from './AppImage';

const W = Dimensions.get('window').width;

export interface PhotoViewerItem {
  photo_id: string;
  image_url: string;
}

export function PhotoViewer<T extends PhotoViewerItem>({
  photos,
  index,
  onIndexChange,
  onClose,
  title,
  subtitle,
  onTitlePress,
  onMenu,
  renderFooter,
}: {
  photos: T[];
  /** null이면 닫힌 상태 */
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** 헤더 가운데 — 없으면 'n / m' 카운터를 쓴다 */
  title?: (photo: T) => string | null;
  subtitle?: (photo: T) => string | null;
  /** 제목을 누를 수 있게 한다(장소로 이동 등) */
  onTitlePress?: (photo: T) => void;
  /** 우상단 ⋯ — 없으면 버튼을 그리지 않는다 */
  onMenu?: (photo: T) => void;
  /** 하단에 읽을 것(공개범위·메모 등). 버튼은 두지 않는다 */
  renderFooter?: (photo: T) => React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const open = index !== null;
  const current = open ? photos[index as number] : undefined;

  const onScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) =>
      onIndexChange(Math.round(e.nativeEvent.contentOffset.x / W)),
    [onIndexChange],
  );

  const heading = current ? title?.(current) ?? null : null;
  const sub = current ? subtitle?.(current) ?? null : null;
  const counter = open && photos.length > 1 ? `${(index as number) + 1} / ${photos.length}` : null;
  const footer = current ? renderFooter?.(current) : null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          keyExtractor={p => p.photo_id}
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            // 사진을 누르면 닫힌다 — 조작은 전부 헤더에 있으므로 여기선 닫기만.
            <Pressable style={s.page} onPress={onClose}>
              <AppImage
                source={{ uri: item.image_url }}
                style={{ width: W, aspectRatio: 1 }}
                resizeMode="contain"
              />
            </Pressable>
          )}
        />

        {/* ── 헤더 — 조작은 여기에 모은다 ── */}
        <View style={[s.header, { paddingTop: insets.top + Spacing[8] }]}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Icon name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            {heading ? (
              <TouchableOpacity
                disabled={!onTitlePress}
                onPress={() => current && onTitlePress?.(current)}
                activeOpacity={0.7}
                accessibilityRole={onTitlePress ? 'link' : 'text'}
                accessibilityLabel={onTitlePress ? `${heading} 장소로 이동` : heading}
              >
                <View style={s.titleRow}>
                  <Text style={s.title} numberOfLines={1}>{heading}</Text>
                  {onTitlePress && <Icon name="forward" size={13} color="rgba(255,255,255,0.8)" />}
                </View>
                {sub ? <Text style={s.subtitle}>{sub}</Text> : null}
              </TouchableOpacity>
            ) : counter ? (
              <Text style={s.counter}>{counter}</Text>
            ) : null}
          </View>

          {onMenu ? (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => current && onMenu(current)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="사진 관리"
            >
              <Icon name="more" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            // 제목을 가운데로 유지하기 위한 자리
            <View style={s.iconBtn} />
          )}
        </View>

        {/* ── 하단 — 읽을 것만 ── */}
        {footer ? (
          <View style={[s.footer, { paddingBottom: insets.bottom + Spacing[20] }]}>
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  page: { width: W, flex: 1, justifyContent: 'center' },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[8], paddingBottom: Spacing[10],
    // 사진이 밝으면 흰 글씨가 묻힌다 — 위쪽만 옅게 깐다
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing[4] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { ...Typography.title.s, color: '#FFFFFF', maxWidth: W * 0.55 },
  // 제목 아래 보조줄. 제목이 있을 때만 쓰이므로 제목보다 한 단계 작다.
  subtitle: { ...Typography.label.l, color: 'rgba(255,255,255,0.82)', textAlign: 'center' },
  // 카운터('3 / 12')는 제목이 없는 화면에서 **그 자체가 헤더**다. 장소 상세가 그렇다.
  // caption(12)으로 두니 어두운 배경에서 거의 안 읽혔다 — 제목과 같은 급으로 올린다.
  counter: { ...Typography.title.s, color: 'rgba(255,255,255,0.95)', textAlign: 'center' },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing[20], paddingTop: Spacing[14],
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: Spacing[8],
  },
});

/** 하단에 자주 쓰는 조각들 — 화면마다 다시 만들지 않게 */
export const photoViewerFooterStyles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: Spacing[6] },
  chip: {
    paddingHorizontal: Spacing[8], paddingVertical: 2,
    borderRadius: Radius.round,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  chipText: { ...Typography.label.s, color: '#FFFFFF' },
  note: { ...Typography.body.s, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
});
