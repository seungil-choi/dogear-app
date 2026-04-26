// Dogear Design System Tokens v1.0
// "따뜻하고 정돈된 생활형 장소 서비스"
// Brand direction: 밝고 따뜻한 브라운 계열 + 절제된 주황 계열 + 따뜻한 중립색

// ─────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────
export const Colors = {
  // Brand — 따뜻한 주황-브라운
  brand: {
    primary:      '#C97432',   // 브랜드 액센트 기본 — CTA, 선택 상태, 핵심 강조
    primaryLight: '#FDEAD9',   // 연한 브랜드 배경 — 선택 상태 약한 배경
    secondary:    '#A85E28',   // 보조 강조색 — pressed / 강한 강조
    subtle:       '#FFF7F1',   // 가장 연한 브랜드 배경
    onPrimary:    '#FFFFFF',
    accent:       '#84481F',   // 텍스트형 강조 / 어두운 액센트
  },

  // Background / Surface — 따뜻한 웜 뉴트럴
  bg: {
    primary:   '#FCFBFA',   // 앱 전체 기본 배경
    secondary: '#F7F3EE',   // 섹션 블록 배경
    tertiary:  '#F2ECE5',   // 더 진한 섹션 / 보조 카드 배경
  },
  surface: {
    default:  '#FFFFFF',    // 기본 카드 배경
    elevated: '#FFFFFF',
    subtle:   '#FAF7F3',    // 보조 카드 배경
    sheet:    '#FFFFFF',    // 바텀시트
    selected: '#FFF3E8',    // 선택 상태 배경
  },

  // Border
  border: {
    default: '#ECE8E4',   // 기본 구분선
    strong:  '#D9D2CC',   // 강한 구분선
    subtle:  '#ECE8E4',   // 아주 약한 구분
    brand:   '#F7D1B0',   // 브랜드 보더
    active:  '#C97432',   // 활성 보더
  },

  // Text — 따뜻한 중립 계열
  text: {
    primary:     '#2F2A27',   // 기본 제목/본문
    secondary:   '#6F655E',   // 보조 설명
    tertiary:    '#8E837A',   // 약한 정보 / placeholder
    inverse:     '#FFFFFF',
    link:        '#84481F',   // 브랜드성 강조 텍스트
    placeholder: '#B7ADA5',
  },

  // Status — 장소 분위기 (웜 팔레트 기반)
  status: {
    quiet:   { bg: '#F7F3EE', text: '#6E5343' },   // 한적함
    active:  { bg: '#FFF3E8', text: '#A85E28' },   // 활발함
    mixed:   { bg: '#F0EEF8', text: '#6B5EA8' },   // 복합적
    recent:  { bg: '#FDEAD9', text: '#84481F' },   // 최근 흔적
    success: { bg: '#EEF1EC', text: '#4D7A49' },
    warning: { bg: '#FFF8E8', text: '#B87C1A' },
    error:   { bg: '#FBF0F0', text: '#C7655B' },
    info:    { bg: '#F0EEF8', text: '#8C7BCA' },
  },

  // Safety — 공개 범위
  safety: {
    private:       { bg: '#F7F3EE', text: '#6E5343', dot: '#A78972' },
    spotOnly:      { bg: '#FFF3E8', text: '#84481F', dot: '#C97432' },
    familiarLayer: { bg: '#F0EEF8', text: '#6B5EA8', dot: '#8C7BCA' },
  },

  // Map pin
  pin: {
    default: '#B7ADA5',
    recent:  '#C97432',
    visited: '#A85E28',
    regular: '#84481F',
  },

  // Util
  overlay:      'rgba(47, 42, 39, 0.32)',
  overlayLight: 'rgba(47, 42, 39, 0.08)',
  transparent:  'transparent',
};

// ─────────────────────────────────────────
// SPACING
// ─────────────────────────────────────────
export const Spacing = {
  2: 2,
  3: 3,
  4: 4,
  6: 6,
  8: 8,
  9: 9,
  10: 10,
  12: 12,
  13: 13,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
  40: 40,
  48: 48,
  56: 56,
  64: 64,
};

// ─────────────────────────────────────────
// RADIUS — 토큰 정의서 기준
// ─────────────────────────────────────────
export const Radius = {
  s:    8,    // 입력창 등
  m:    12,   // 카드 내부 요소
  l:    16,   // 카드 기본
  xl:   20,   // 큰 카드 / 바텀시트 내부 요소
  round: 999, // 칩 / 플로팅 버튼
};

// ─────────────────────────────────────────
// SHADOW — 매우 약하게, 웜 톤
// ─────────────────────────────────────────
export const Shadow = {
  none: {},
  s: {
    shadowColor: '#2F2A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  m: {
    shadowColor: '#2F2A27',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  l: {
    shadowColor: '#2F2A27',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 28,
    elevation: 12,
  },
  paw: {
    // 플로팅 발도장 CTA 전용
    shadowColor: '#C97432',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 10,
  },
};

// ─────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────
export const Typography = {
  display: {
    l: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
    m: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.3 },
    s: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  },
  title: {
    l: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
    m: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2 },
    s: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  },
  body: {
    l: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
    m: { fontSize: 14, lineHeight: 22, fontWeight: '400' as const },
    s: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },
  },
  label: {
    l: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
    m: { fontSize: 13, lineHeight: 19, fontWeight: '500' as const },
    s: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
  },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const },
};

// ─────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────
export const Layout = {
  screenPadding: 16,
  cardPadding: 16,
  tabBarHeight: 60,
  headerHeight: 56,
};
