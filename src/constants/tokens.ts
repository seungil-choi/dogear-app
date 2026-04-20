// Dogear Design System Tokens
// "차분하고 명확하고 따뜻하게"

// ─────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────
export const Colors = {
  // Brand
  brand: {
    primary: '#4A7C59',       // 차분한 그린 – 발도장 CTA, 선택 상태
    primaryLight: '#E8F0EA',  // 연한 브랜드
    secondary: '#7BA08B',     // 보조 브랜드
    subtle: '#F0F5F1',        // 매우 연한 배경
    onPrimary: '#FFFFFF',
  },

  // Background / Surface
  bg: {
    primary: '#FFFFFF',
    secondary: '#F7F7F5',
    tertiary: '#F0EFEB',
  },
  surface: {
    default: '#FFFFFF',
    elevated: '#FFFFFF',
    subtle: '#F7F7F5',
    sheet: '#FFFFFF',
  },

  // Border
  border: {
    default: '#E8E7E3',
    strong: '#C8C7C3',
    subtle: '#F0EFEB',
  },

  // Text
  text: {
    primary: '#1A1A1A',
    secondary: '#5C5C5A',
    tertiary: '#9C9B97',
    inverse: '#FFFFFF',
    link: '#4A7C59',
    placeholder: '#B8B7B3',
  },

  // Status – 장소 분위기
  status: {
    quiet: { bg: '#EEF4F0', text: '#3D6B4A' },
    active: { bg: '#FFF3E8', text: '#C2691A' },
    mixed: { bg: '#F3F1F8', text: '#6B5EA8' },
    recent: { bg: '#E8F3F8', text: '#1A6B8A' },
    success: { bg: '#EEF4F0', text: '#3D6B4A' },
    warning: { bg: '#FFF8E8', text: '#B87C1A' },
    error: { bg: '#FBF0F0', text: '#B84040' },
    info: { bg: '#E8EFF8', text: '#2B5BA8' },
  },

  // Safety – 공개 범위
  safety: {
    private: { bg: '#F3F3F3', text: '#555553', dot: '#888884' },
    spotOnly: { bg: '#EEF4F0', text: '#3D6B4A', dot: '#4A7C59' },
    familiarLayer: { bg: '#E8EFF8', text: '#2B5BA8', dot: '#3B6BB8' },
  },

  // Map pin
  pin: {
    default: '#9C9B97',
    recent: '#4A7C59',
    visited: '#7BA08B',
    regular: '#2C5840',
  },

  // Util
  overlay: 'rgba(0,0,0,0.4)',
  overlayLight: 'rgba(0,0,0,0.08)',
  transparent: 'transparent',
};

// ─────────────────────────────────────────
// SPACING
// ─────────────────────────────────────────
export const Spacing = {
  2: 2,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
  56: 56,
  64: 64,
};

// ─────────────────────────────────────────
// RADIUS
// ─────────────────────────────────────────
export const Radius = {
  s: 6,
  m: 10,
  l: 14,
  xl: 20,
  round: 999,
};

// ─────────────────────────────────────────
// SHADOW
// ─────────────────────────────────────────
export const Shadow = {
  none: {},
  s: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  m: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  l: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
  },
};

// ─────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────
export const Typography = {
  display: {
    l: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.5 },
    m: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.3 },
  },
  title: {
    l: { fontSize: 20, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
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
    m: { fontSize: 12, lineHeight: 18, fontWeight: '500' as const },
    s: { fontSize: 11, lineHeight: 16, fontWeight: '500' as const },
  },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: '400' as const },
};

// ─────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────
export const Layout = {
  screenPadding: 16,
  cardPadding: 16,
  tabBarHeight: 56,
  headerHeight: 56,
};
