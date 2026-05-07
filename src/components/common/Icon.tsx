/**
 * Icon — DogEar 아이콘 시스템
 *
 * @expo/vector-icons (Ionicons + MaterialCommunityIcons)를 래핑해
 * 앱 전체에서 일관된 아이콘을 제공한다.
 *
 * 사용법:
 *   <Icon name="home" size={24} color={Colors.text.primary} />
 *   <Icon name="paw" size={20} color={Colors.brand.primary} />
 */

import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// ─── 아이콘 매핑 테이블 ───────────────────────────────────────
// DogEar 전용 시맨틱 이름 → 실제 아이콘 매핑

type IconSource = 'ion' | 'mci';

interface IconDef {
  source: IconSource;
  name: string;
}

const ICON_MAP: Record<string, IconDef> = {
  // ─ 네비게이션 탭 ─
  home:           { source: 'ion', name: 'home-outline' },
  'home-filled':  { source: 'ion', name: 'home' },
  map:            { source: 'ion', name: 'map-outline' },
  'map-filled':   { source: 'ion', name: 'map' },
  paw:            { source: 'mci', name: 'paw-outline' },
  'paw-filled':   { source: 'mci', name: 'paw' },
  bookmark:       { source: 'ion', name: 'bookmark-outline' },
  'bookmark-filled': { source: 'ion', name: 'bookmark' },
  person:         { source: 'ion', name: 'person-outline' },
  'person-filled':{ source: 'ion', name: 'person' },

  // ─ 액션 ─
  close:          { source: 'ion', name: 'close' },
  back:           { source: 'ion', name: 'chevron-back' },
  forward:        { source: 'ion', name: 'chevron-forward' },
  down:           { source: 'ion', name: 'chevron-down' },
  up:             { source: 'ion', name: 'chevron-up' },
  check:          { source: 'ion', name: 'checkmark' },
  'check-circle': { source: 'ion', name: 'checkmark-circle' },
  plus:           { source: 'ion', name: 'add' },
  search:         { source: 'ion', name: 'search-outline' },
  filter:         { source: 'ion', name: 'options-outline' },
  share:          { source: 'ion', name: 'share-outline' },
  more:           { source: 'ion', name: 'ellipsis-horizontal' },
  copy:           { source: 'ion', name: 'copy-outline' },
  chat:           { source: 'ion', name: 'chatbubble-outline' },
  'chat-filled':  { source: 'ion', name: 'chatbubble' },

  // ─ UI 요소 ─
  bell:           { source: 'ion', name: 'notifications-outline' },
  'bell-filled':  { source: 'ion', name: 'notifications' },
  location:       { source: 'ion', name: 'location-outline' },
  'location-filled': { source: 'ion', name: 'location' },
  navigate:       { source: 'ion', name: 'navigate-outline' },
  camera:         { source: 'ion', name: 'camera-outline' },
  image:          { source: 'ion', name: 'image-outline' },
  trash:          { source: 'ion', name: 'trash-outline' },
  edit:           { source: 'ion', name: 'pencil-outline' },
  eye:            { source: 'ion', name: 'eye-outline' },
  'eye-off':      { source: 'ion', name: 'eye-off-outline' },

  // ─ 프라이버시 / 설정 ─
  lock:           { source: 'ion', name: 'lock-closed-outline' },
  'lock-open':    { source: 'ion', name: 'lock-open-outline' },
  settings:       { source: 'ion', name: 'settings-outline' },
  shield:         { source: 'ion', name: 'shield-checkmark-outline' },
  help:           { source: 'ion', name: 'help-circle-outline' },
  document:       { source: 'ion', name: 'document-text-outline' },
  logout:         { source: 'ion', name: 'log-out-outline' },
  warning:        { source: 'ion', name: 'warning-outline' },
  info:           { source: 'ion', name: 'information-circle-outline' },

  // ─ 반려견 / 스팟 ─
  dog:            { source: 'mci', name: 'dog' },
  'dog-side':     { source: 'mci', name: 'dog-side' },
  star:           { source: 'ion', name: 'star' },
  'star-outline': { source: 'ion', name: 'star-outline' },
  heart:          { source: 'ion', name: 'heart-outline' },
  'heart-filled': { source: 'ion', name: 'heart' },
  walk:           { source: 'mci', name: 'walk' },
  flag:           { source: 'ion', name: 'flag-outline' },
  'flag-filled':  { source: 'ion', name: 'flag' },
  list:           { source: 'ion', name: 'list-outline' },

  // ─ 카테고리 ─
  park:           { source: 'mci', name: 'tree-outline' },
  trail:          { source: 'mci', name: 'hiking' },
  riverside:      { source: 'mci', name: 'waves' },
  rest:           { source: 'ion', name: 'cafe-outline' },
  leaf:           { source: 'ion', name: 'leaf-outline' },
  'leaf-filled':  { source: 'ion', name: 'leaf' },
  tag:            { source: 'ion', name: 'pricetag-outline' },
  'tag-filled':   { source: 'ion', name: 'pricetag' },
};

export type IconName = keyof typeof ICON_MAP;

// ─── 컴포넌트 ───────────────────────────────────────

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color = '#1A1A1A' }: IconProps) {
  const def = ICON_MAP[name];

  if (!def) {
    // fallback: 정의되지 않은 아이콘
    console.warn(`[Icon] Unknown icon name: "${name}"`);
    return <Ionicons name="help-circle-outline" size={size} color={color} />;
  }

  if (def.source === 'ion') {
    return (
      <Ionicons
        name={def.name as any}
        size={size}
        color={color}
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name={def.name as any}
      size={size}
      color={color}
    />
  );
}
