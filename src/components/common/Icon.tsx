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
// lucide는 배럴(import { X } from 'lucide-react-native')로 가져오면 Metro가
// 트리셰이킹을 하지 않아 아이콘 약 1,500개가 통째로 번들에 실린다.
// 실측(android hbc): 배럴 7.35MB vs 아이콘 제거 5.56MB — 51개 쓰자고 1.79MB.
// 그래서 개별 모듈을 직접 가리킨다. 경로가 바뀌면 빌드가 즉시 실패하므로 조용히 깨지지 않는다.
// 타입 선언은 types/lucide-icons.d.ts 참고.
// 네비게이션
import Home from 'lucide-react-native/dist/esm/icons/house.mjs';
import Map from 'lucide-react-native/dist/esm/icons/map.mjs';
import PawPrint from 'lucide-react-native/dist/esm/icons/paw-print.mjs';
import Bookmark from 'lucide-react-native/dist/esm/icons/bookmark.mjs';
import User from 'lucide-react-native/dist/esm/icons/user.mjs';
// 액션
import X from 'lucide-react-native/dist/esm/icons/x.mjs';
import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left.mjs';
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down.mjs';
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up.mjs';
import Check from 'lucide-react-native/dist/esm/icons/check.mjs';
import CheckCircle2 from 'lucide-react-native/dist/esm/icons/circle-check.mjs';
import Plus from 'lucide-react-native/dist/esm/icons/plus.mjs';
import Search from 'lucide-react-native/dist/esm/icons/search.mjs';
import SlidersHorizontal from 'lucide-react-native/dist/esm/icons/sliders-horizontal.mjs';
import Share2 from 'lucide-react-native/dist/esm/icons/share-2.mjs';
import MoreHorizontal from 'lucide-react-native/dist/esm/icons/ellipsis.mjs';
import Copy from 'lucide-react-native/dist/esm/icons/copy.mjs';
import RotateCw from 'lucide-react-native/dist/esm/icons/rotate-cw.mjs';
// UI
import Bell from 'lucide-react-native/dist/esm/icons/bell.mjs';
import Mail from 'lucide-react-native/dist/esm/icons/mail.mjs';
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin.mjs';
import Navigation from 'lucide-react-native/dist/esm/icons/navigation.mjs';
import Camera from 'lucide-react-native/dist/esm/icons/camera.mjs';
import ImageIcon from 'lucide-react-native/dist/esm/icons/image.mjs';
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2.mjs';
import Pencil from 'lucide-react-native/dist/esm/icons/pencil.mjs';
import Eye from 'lucide-react-native/dist/esm/icons/eye.mjs';
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off.mjs';
// 프라이버시 / 설정
import Lock from 'lucide-react-native/dist/esm/icons/lock.mjs';
import LockOpen from 'lucide-react-native/dist/esm/icons/lock-open.mjs';
import Settings from 'lucide-react-native/dist/esm/icons/settings.mjs';
import ShieldCheck from 'lucide-react-native/dist/esm/icons/shield-check.mjs';
import HelpCircle from 'lucide-react-native/dist/esm/icons/circle-question-mark.mjs';
import FileText from 'lucide-react-native/dist/esm/icons/file-text.mjs';
import LogOut from 'lucide-react-native/dist/esm/icons/log-out.mjs';
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert.mjs';
import Info from 'lucide-react-native/dist/esm/icons/info.mjs';
// 반려견 / 스팟
import Dog from 'lucide-react-native/dist/esm/icons/dog.mjs';
import Star from 'lucide-react-native/dist/esm/icons/star.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import Footprints from 'lucide-react-native/dist/esm/icons/footprints.mjs';
import Flag from 'lucide-react-native/dist/esm/icons/flag.mjs';
import Phone from 'lucide-react-native/dist/esm/icons/phone.mjs';
import List from 'lucide-react-native/dist/esm/icons/list.mjs';
// 카테고리
import TreePine from 'lucide-react-native/dist/esm/icons/tree-pine.mjs';
import Mountain from 'lucide-react-native/dist/esm/icons/mountain.mjs';
import Waves from 'lucide-react-native/dist/esm/icons/waves-horizontal.mjs';
import Coffee from 'lucide-react-native/dist/esm/icons/coffee.mjs';
import Leaf from 'lucide-react-native/dist/esm/icons/leaf.mjs';
import Tag from 'lucide-react-native/dist/esm/icons/tag.mjs';
// 메시지
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle.mjs';

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

// ⚠️ 타입 주석(: Record<string, IconDef>) 대신 satisfies를 쓴다.
//    주석을 달면 keyof가 string으로 넓어져 IconName이 사실상 string이 되고,
//    없는 아이콘 이름도 tsc를 통과해 화면에는 물음표만 뜬다(실제로 phone이 그랬다).
//    satisfies는 값의 리터럴 키를 보존하면서 형태만 검사한다.
export const ICON_MAP = {
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
  refresh:            { Component: RotateCw },
  chat:               { Component: MessageCircle },
  'chat-filled':      { Component: MessageCircle, filled: true },

  // ─ UI 요소 ─
  bell:               { Component: Bell },
  mail:               { Component: Mail },
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
  phone:              { Component: Phone },
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
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICON_MAP;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Lucide 기본 stroke 1.75 → 작은 사이즈에선 자동 가중 (가독성) */
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#222222', strokeWidth }: IconProps) {
  const def = ICON_MAP[name];

  if (!def) {
    if (__DEV__) console.warn(`[Icon] Unknown icon name: "${name}"`);
    return <HelpCircle size={size} color={color} strokeWidth={strokeWidth ?? 1.75} />;
  }

  const { Component, filled } = def as IconDef;
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
