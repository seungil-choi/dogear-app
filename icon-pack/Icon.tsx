/**
 * Semantic Icon — Lucide 기반 React Native 아이콘 시스템
 *
 * 핵심 아이디어
 *   1. 시맨틱 이름(home, paw, location, ...)으로 호출 → 호출부에서 라이브러리 종속 제거
 *   2. "*-filled" 변형은 같은 컴포넌트 + fill prop으로 통일
 *   3. stroke-width 자동 가중 (작은 사이즈일수록 두껍게 → 가독성)
 *
 * 사용
 *   <Icon name="home" size={24} color="#1A1A1A" />
 *   <Icon name="bookmark-filled" size={20} color="#FF6B35" />
 *   <Icon name="search" size={16} />        // 작은 크기는 stroke 자동 굵게
 *
 * 의존성
 *   - lucide-react-native (MIT, 출처 표기 불필요)
 *   - react-native-svg (peer)
 *
 * 새 아이콘 추가
 *   1. lucide-react-native 에서 컴포넌트 import
 *   2. ICON_MAP 에 시맨틱 이름 매핑 추가 (* -filled 가 필요하면 filled:true)
 *
 * 라이선스: MIT
 */

import React from 'react';
import {
  // 네비게이션
  Home,
  Map,
  PawPrint,
  Bookmark,
  User,
  // 액션
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCircle2,
  Plus,
  Search,
  SlidersHorizontal,
  Share2,
  MoreHorizontal,
  Copy,
  // UI
  Bell,
  MapPin,
  Navigation,
  Camera,
  Image as ImageIcon,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  // 프라이버시 / 설정
  Lock,
  LockOpen,
  Settings,
  ShieldCheck,
  HelpCircle,
  FileText,
  LogOut,
  TriangleAlert,
  Info,
  // 도메인 (반려견·산책)
  Dog,
  Star,
  Heart,
  Footprints,
  Flag,
  List,
  // 카테고리 (장소 유형)
  TreePine,
  Mountain,
  Waves,
  Coffee,
  Leaf,
  Tag,
  // 메시지
  MessageCircle,
} from 'lucide-react-native';

type LucideIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}>;

interface IconDef {
  Component: LucideIcon;
  /** filled 변형이면 stroke 색상으로 fill까지 적용 */
  filled?: boolean;
}

const ICON_MAP: Record<string, IconDef> = {
  // ─ 네비게이션 ─
  home:               { Component: Home },
  'home-filled':      { Component: Home, filled: true },
  map:                { Component: Map },
  'map-filled':       { Component: Map, filled: true },
  paw:                { Component: PawPrint },
  'paw-filled':       { Component: PawPrint, filled: true },
  bookmark:           { Component: Bookmark },
  'bookmark-filled':  { Component: Bookmark, filled: true },
  person:             { Component: User },
  'person-filled':    { Component: User, filled: true },

  // ─ 액션 ─
  close:              { Component: X },
  back:               { Component: ChevronLeft },
  forward:            { Component: ChevronRight },
  down:               { Component: ChevronDown },
  up:                 { Component: ChevronUp },
  check:              { Component: Check },
  'check-circle':     { Component: CheckCircle2 },
  plus:               { Component: Plus },
  search:             { Component: Search },
  filter:             { Component: SlidersHorizontal },
  share:              { Component: Share2 },
  more:               { Component: MoreHorizontal },
  copy:               { Component: Copy },
  chat:               { Component: MessageCircle },
  'chat-filled':      { Component: MessageCircle, filled: true },

  // ─ UI 요소 ─
  bell:               { Component: Bell },
  'bell-filled':      { Component: Bell, filled: true },
  location:           { Component: MapPin },
  'location-filled':  { Component: MapPin, filled: true },
  navigate:           { Component: Navigation },
  camera:             { Component: Camera },
  image:              { Component: ImageIcon },
  trash:              { Component: Trash2 },
  edit:               { Component: Pencil },
  eye:                { Component: Eye },
  'eye-off':          { Component: EyeOff },

  // ─ 프라이버시 / 설정 ─
  lock:               { Component: Lock },
  'lock-open':        { Component: LockOpen },
  settings:           { Component: Settings },
  shield:             { Component: ShieldCheck },
  help:               { Component: HelpCircle },
  document:           { Component: FileText },
  logout:             { Component: LogOut },
  warning:            { Component: TriangleAlert },
  info:               { Component: Info },

  // ─ 도메인 (반려견·산책) ─
  dog:                { Component: Dog },
  'dog-side':         { Component: Dog },
  star:               { Component: Star, filled: true },
  'star-outline':     { Component: Star },
  heart:              { Component: Heart },
  'heart-filled':     { Component: Heart, filled: true },
  walk:               { Component: Footprints },
  flag:               { Component: Flag },
  'flag-filled':      { Component: Flag, filled: true },
  list:               { Component: List },

  // ─ 카테고리 (장소 유형) ─
  park:               { Component: TreePine },
  trail:              { Component: Mountain },
  riverside:          { Component: Waves },
  rest:               { Component: Coffee },
  leaf:               { Component: Leaf },
  'leaf-filled':      { Component: Leaf, filled: true },
  tag:                { Component: Tag },
  'tag-filled':       { Component: Tag, filled: true },
};

export type IconName =
  | 'home' | 'home-filled'
  | 'map' | 'map-filled'
  | 'paw' | 'paw-filled'
  | 'bookmark' | 'bookmark-filled'
  | 'person' | 'person-filled'
  | 'close' | 'back' | 'forward' | 'down' | 'up'
  | 'check' | 'check-circle' | 'plus' | 'search' | 'filter' | 'share' | 'more' | 'copy'
  | 'chat' | 'chat-filled'
  | 'bell' | 'bell-filled'
  | 'location' | 'location-filled'
  | 'navigate' | 'camera' | 'image' | 'trash' | 'edit' | 'eye' | 'eye-off'
  | 'lock' | 'lock-open' | 'settings' | 'shield' | 'help' | 'document' | 'logout' | 'warning' | 'info'
  | 'dog' | 'dog-side'
  | 'star' | 'star-outline'
  | 'heart' | 'heart-filled'
  | 'walk' | 'flag' | 'flag-filled' | 'list'
  | 'park' | 'trail' | 'riverside' | 'rest'
  | 'leaf' | 'leaf-filled'
  | 'tag' | 'tag-filled';

interface IconProps {
  /** 시맨틱 이름 (ICON_MAP key) */
  name: IconName;
  /** 픽셀 단위 크기. default 24 */
  size?: number;
  /** 라인/채움 색상. default #1A1A1A */
  color?: string;
  /** 명시 지정 시 자동 가중을 무시하고 그대로 사용 */
  strokeWidth?: number;
}

/**
 * 시맨틱 라인 아이콘 — Lucide 기반.
 *
 * stroke 자동 가중:
 *   ≤ 16: 2.0   (작아도 또렷)
 *   ≤ 24: 1.75  (기본)
 *   ≥ 25: 1.5   (크면 슬림)
 */
export function Icon({ name, size = 24, color = '#1A1A1A', strokeWidth }: IconProps) {
  const def = ICON_MAP[name];

  if (!def) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[Icon] Unknown icon name: "${name}"`);
    }
    return <HelpCircle size={size} color={color} strokeWidth={strokeWidth ?? 1.75} />;
  }

  const { Component, filled } = def;
  const sw = strokeWidth ?? (size <= 16 ? 2 : size <= 24 ? 1.75 : 1.5);

  return (
    <Component
      size={size}
      color={color}
      strokeWidth={sw}
      fill={filled ? color : 'none'}
    />
  );
}

/** 모든 시맨틱 이름 배열 (showcase / 디버그용) */
export const ALL_ICON_NAMES: IconName[] = Object.keys(ICON_MAP) as IconName[];
