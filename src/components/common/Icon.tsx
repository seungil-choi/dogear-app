/**
 * Icon — DogEar 아이콘 시스템
 *
 * Lucide(MIT, 출처 표기 불필요)를 래핑해 앱 전체에서 일관된 라인 아이콘을 제공한다.
 * 이전 Ionicons / MaterialCommunityIcons 의존을 제거하고 단일 소스로 통일.
 *
 * 사용법:
 *   <Icon name="home" size={24} color={Colors.text.primary} />
 *   <Icon name="bookmark-filled" size={20} color={Colors.brand.primary} />
 *
 * 시맨틱 이름 → Lucide 컴포넌트 매핑 (앱 내부에서 시맨틱 이름만 사용).
 * "*-filled" 변형은 같은 컴포넌트에 fill prop을 주어 채움 표현.
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
  // 반려견 / 스팟
  Dog,
  Star,
  Heart,
  Footprints,
  Flag,
  List,
  // 카테고리
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
  // ─ 네비게이션 탭 ─
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

  // ─ 반려견 / 스팟 ─
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

  // ─ 카테고리 ─
  park:               { Component: TreePine },
  trail:              { Component: Mountain },
  riverside:          { Component: Waves },
  rest:               { Component: Coffee },
  leaf:               { Component: Leaf },
  'leaf-filled':      { Component: Leaf, filled: true },
  tag:                { Component: Tag },
  'tag-filled':       { Component: Tag, filled: true },
};

export type IconName = keyof typeof ICON_MAP;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Lucide 기본 stroke 1.75 → 작은 사이즈에선 자동 가중 (가독성) */
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#1A1A1A', strokeWidth }: IconProps) {
  const def = ICON_MAP[name];

  if (!def) {
    if (__DEV__) console.warn(`[Icon] Unknown icon name: "${name}"`);
    return <HelpCircle size={size} color={color} strokeWidth={strokeWidth ?? 1.75} />;
  }

  const { Component, filled } = def;
  // 작은 크기에선 stroke 살짝 두껍게(가독성), 큰 크기에선 1.5(깔끔)
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
