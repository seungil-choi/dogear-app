// Dogear Design System Tokens v3.0 — Brand Refresh (Vivid Orange)
// 브랜드 팔레트: 브랜드 가이드 시트 기준 (2026-07)
//   Primary   Orange #FF7A30 · Red #FF4D2D
//   Neutral   Cream #FFF6F0 · Light Gray #F2F2F2 · Gray #BDBDBD · Dark Gray #555555 · Charcoal #222222
//   BG        화이트 캔버스(#FFFFFF) — Cream/Peach/Orange Light는 브랜드 포인트 전용(전면 배경 금지)
//   Gradient  Orange #FF9B4D→#FF6A2D · Red #FF6A5A→#FF2E2E
// 파생 규칙(Derived): 소형 텍스트로 쓰이는 브랜드/그레이는 명도대비 4.5:1(KWCAG)을
//   만족하도록 짙게 파생한다 — Deep Orange #C2410C, Deep Red #C73620, Mid Gray #6E6E6E.
// 구조: Cohere 레이아웃 원칙 유지 (22px 시그니처 카드, pill CTA, shadow-free)

// ─────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────
/**
 * 브랜드 옅은 배경(Peach) — 선택/활성 상태의 단일 출처.
 *
 * 과거에 brand.subtle(#FFF0E6) · surface.selected(#FFF0E6) · brand.primaryLight(#FFEDE3)
 * 세 토큰이 모두 "선택 배경"으로 쓰여, 값이 같거나(앞 둘) 육안 구분이 안 되는 차이(3/255)로
 * 갈려 있었다. 하나로 묶어 브랜드 톤을 조정할 때 일부만 바뀌는 사고를 막는다.
 */
const BRAND_PEACH = '#FFF0E6';

export const Colors = {
  // Brand — Vivid Orange (브랜드 시트 Primary)
  brand: {
    primary:      '#FF7A30',   // Orange — CTA, 선택, 핵심 강조
    primaryLight: BRAND_PEACH, // Light Peach — 선택 배경 (surface.selected와 동일 값)
    secondary:    '#FF6A2D',   // Deep Orange(그라디언트 종점) — pressed / 강한 강조
    subtle:       BRAND_PEACH, // Orange Light — 브랜드 옅은 배경
    onPrimary:    '#FFFFFF',
    accent:       '#C2410C',   // Derived Deep Orange — 텍스트형 강조 (4.5:1 확보)
  },

  // Background / Surface — 화이트 캔버스
  //   (Cream 캔버스는 전면 적용 시 미세한 오렌지 틴트로 피로감 유발 → 화이트로 확정.
  //    Cream/Peach는 배경이 아니라 브랜드 '포인트'(brand.subtle 등)에만 쓴다.)
  bg: {
    primary:   '#FFFFFF',   // 순수 화이트 캔버스
    secondary: '#FAFAFA',   // 뉴트럴 스노우 — 약한 섹션 구분
    tertiary:  '#F2F2F2',   // Light Gray — 뉴트럴 카드 내부 배경
  },
  surface: {
    default:  '#FFFFFF',
    elevated: '#FFFFFF',
    subtle:   '#FAFAFA',
    sheet:    '#FFFFFF',
    selected: BRAND_PEACH, // Orange Light — 브랜드 선택 배경 (의도된 포인트)
  },

  // Border — 뉴트럴 라이트
  border: {
    default: '#E5E7EB',   // 뉴트럴 라이트 보더
    strong:  '#BDBDBD',   // Gray (브랜드 시트 Neutral)
    subtle:  '#F2F2F2',   // Light Gray
    brand:   '#FFD4B8',   // Derived — Orange 파스텔 보더
    active:  '#FF7A30',   // Orange — 활성 보더
  },

  // Text — Charcoal 기반 (브랜드 시트 Neutral)
  text: {
    primary:     '#222222',   // Charcoal
    secondary:   '#555555',   // Dark Gray
    tertiary:    '#6E6E6E',   // Derived Mid Gray — 소형 텍스트 4.5:1 확보 (#BDBDBD는 미달)
    inverse:     '#FFFFFF',
    link:        '#C2410C',   // Derived Deep Orange — 링크/텍스트 강조
    placeholder: '#BDBDBD',   // Gray (입력 힌트 — 관례상 대비 예외 허용)
  },

  // Status
  status: {
    quiet:   { bg: '#F2F2F2', text: '#555555' },
    active:  { bg: '#FFF0E6', text: '#C2410C' },
    mixed:   { bg: '#F0EEF8', text: '#6B5EA8' },
    recent:  { bg: '#FFEDE3', text: '#C2410C' },
    success: { bg: '#EEF1EC', text: '#4D7A49' },
    warning: { bg: '#FFF8E8', text: '#B87C1A' },
    // border는 error.bg 위에 얹는 '부드러운 경계'용 — text(#C73620)를 테두리로 쓰면
    // 경고 카드가 과하게 강해진다. 강조가 필요한 곳(입력 오류 등)은 계속 text를 쓴다.
    error:   { bg: '#FFEDE9', text: '#C73620', border: '#E8B0AB' },   // Derived Deep Red (브랜드 Red 계열)
    info:    { bg: '#F0EEF8', text: '#8C7BCA' },
  },

  // Safety
  safety: {
    private:       { bg: '#F2F2F2', text: '#555555', dot: '#BDBDBD' },
    spotOnly:      { bg: '#FFF0E6', text: '#C2410C', dot: '#FF7A30' },
    familiarLayer: { bg: '#F0EEF8', text: '#6B5EA8', dot: '#8C7BCA' },
  },

  // Map pin — Orange 계열 위계 (recent < visited < regular)
  pin: {
    default: '#BDBDBD',   // Gray
    recent:  '#FF7A30',   // Orange
    visited: '#FF6A2D',   // Deep Orange
    regular: '#FF4D2D',   // Red — 단골(최상위 관계 강조)
  },

  // ─────────────────────────────────────────
  // Category Thumb — 카테고리별 카드 썸네일 폴백 컬러
  //   bg: 22~33% 알파 적용된 배경 (텍스트 위에 깔리지 않게 옅은 톤)
  //   icon: 같은 hue의 짙은 톤 (아이콘 stroke/fill)
  // 사용처: SpotCard.tsx CategoryThumb (cover_image_url 없을 때 폴백)
  // ─────────────────────────────────────────
  category: {
    park:      { bg: '#7BA08B22', icon: '#5C8A75' },  // 세이지 그린 (자연/공원)
    trail:     { bg: '#C8A87833', icon: '#A88758' },  // 모래 베이지 (산책로)
    riverside: { bg: '#8AA8C033', icon: '#5C7E9A' },  // 스틸 블루 (강변)
    rest:      { bg: '#B89A7E33', icon: '#8B7A60' },  // 웜 그레이 (쉼터)
    other:     { bg: '#FF7A3022', icon: '#FF6A2D' },  // 브랜드 Orange (기타)
  },

  // ─────────────────────────────────────────
  // Onboarding — 슬라이드별 액센트 컬러
  //   다른 hue로 단계 차별화. accent와 호환 (브랜드 hue 변주)
  // 사용처: app/(auth)/onboarding.tsx
  // ─────────────────────────────────────────
  onboarding: {
    discover: '#3B82F6',  // 블루 (탐색)
    paw:      '#FF7A30',  // Orange (브랜드)
    familiar: '#3B5BA9',  // 네이비 (안정)
    privacy:  '#C2410C',  // Deep Orange (개인정보 — 신뢰감)
  },

  // Gradient — 브랜드 시트 Accent/Gradation (LinearGradient colors 배열용)
  gradient: {
    orange: ['#FF9B4D', '#FF6A2D'],
    red:    ['#FF6A5A', '#FF2E2E'],
  },

  // Util
  overlay:      'rgba(34, 34, 34, 0.32)',   // Charcoal 기반
  overlayLight: 'rgba(34, 34, 34, 0.06)',
  transparent:  'transparent',
};

// ─────────────────────────────────────────
// SPACING — 8px base unit
// ─────────────────────────────────────────
export const Spacing = {
  2:  2,
  3:  3,
  4:  4,
  6:  6,
  8:  8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  22: 22,   // 시그니처 카드 패딩
  24: 24,
  28: 28,
  32: 32,
  40: 40,
  48: 48,
  56: 56,   // 섹션 수직 여백
  60: 60,
  64: 64,
};

// ─────────────────────────────────────────
// RADIUS — 22px 시그니처 시스템
// ─────────────────────────────────────────
export const Radius = {
  sharp:     4,    // 태그, 작은 배지
  s:         8,    // 다이얼로그, 보조 컨테이너
  m:        12,    // 중간 카드 내부 요소
  l:        16,    // Featured 컨테이너
  xl:       20,    // 큰 피처 카드
  card:     22,    // 시그니처 — 메인 카드/이미지/컨테이너
  round:  9999,    // Pill — 버튼, 칩, 상태 인디케이터
};

// ─────────────────────────────────────────
// SHADOW — 거의 shadow-free. 깊이는 배경 대비와 보더로 표현.
// ─────────────────────────────────────────
export const Shadow = {
  none: {},
  // Level 1: 보더만 (표준 카드)
  s: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // Level 2: 극히 약한 엘리베이션 (특수 요소에만)
  m: {
    shadowColor: '#222222',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  // Level 3: 바텀시트/모달
  l: {
    shadowColor: '#222222',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  // 발도장 FAB — 브랜드 컬러 글로우 유지
  paw: {
    shadowColor: '#FF7A30',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
};

// ─────────────────────────────────────────
// TYPOGRAPHY — Cohere 원칙 적용
// weight 400 기조, 큰 사이즈에서 음수 letter-spacing, 500은 소형 CTA만
// ─────────────────────────────────────────
export const Typography = {
  // Display — 영향력 있는 헤드라인, 타이트한 행간 + 음수 자간
  display: {
    l: { fontSize: 28, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.56 },
    m: { fontSize: 24, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.48 },
    s: { fontSize: 22, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.44 },
  },
  // Title — UI 제목, 섹션 헤딩
  title: {
    l: { fontSize: 20, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.32 },
    m: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.2  },
    s: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, letterSpacing: -0.1  },
  },
  // Body — 표준 본문. weight 400, size/spacing으로 계층 표현
  body: {
    l: { fontSize: 16, lineHeight: 26, fontWeight: '400' as const },   // 인트로 단락
    m: { fontSize: 14, lineHeight: 22, fontWeight: '400' as const },   // 표준 본문
    s: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },   // 보조 설명
  },
  // Label — 작은 강조. weight 500은 소형 버튼/강조 라벨만
  label: {
    l: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
    m: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
    s: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.2 }, // 코드/태그용 자간
  },
  // Caption — 메타데이터, 푸터 링크
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const, color: '#6E6E6E' },
};

// ─────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────
export const Layout = {
  screenPadding: 16,
  cardPadding:   22,   // 시그니처 카드 내부 패딩 = 22px
  tabBarHeight:  60,
  headerHeight:  56,
  sectionGap:    56,   // 섹션 간 수직 여백
};
