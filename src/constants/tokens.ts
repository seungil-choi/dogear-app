// Dogear Design System Tokens v2.0 — Cohere-inspired
// 구조: Cohere 디자인 시스템 원칙 적용 (22px 시그니처 카드, 쿨 뉴트럴 보더, shadow-free, pill CTA)
// 브랜드: DogEar 웜 브라운 계열 유지 (강아지 앱 정체성)

// ─────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────
export const Colors = {
  // Brand — 따뜻한 주황-브라운 (DogEar identity 유지)
  brand: {
    primary:      '#C97432',   // CTA, 선택, 핵심 강조
    primaryLight: '#FDEAD9',   // 선택 배경
    secondary:    '#A85E28',   // pressed / 강한 강조
    subtle:       '#FFF7F1',
    onPrimary:    '#FFFFFF',
    accent:       '#84481F',   // 텍스트형 강조
  },

  // Background / Surface — Cohere: 화이트 캔버스 + 쿨 뉴트럴
  bg: {
    primary:   '#FFFFFF',   // 순수 흰 캔버스 (Cohere Pure White)
    secondary: '#FAFAFA',   // Snow — 약한 섹션 구분 (Cohere Snow)
    tertiary:  '#F2F2F2',   // 카드 내부 배경 (Cohere Lightest Gray)
  },
  surface: {
    default:  '#FFFFFF',
    elevated: '#FFFFFF',
    subtle:   '#FAFAFA',
    sheet:    '#FFFFFF',
    selected: '#FFF3E8',   // 브랜드 선택 배경은 웜 유지
  },

  // Border — Cohere 쿨 그레이 (기존 웜 보더 → 쿨 뉴트럴로 전환)
  border: {
    default: '#E5E7EB',   // Cohere Border Light (Tailwind gray-200)
    strong:  '#D9D9DD',   // Cohere Border Cool (쿨 퍼플-그레이 틴트)
    subtle:  '#F2F2F2',   // Cohere Lightest Gray
    brand:   '#F7D1B0',   // 브랜드 보더 유지
    active:  '#C97432',   // 활성 보더
  },

  // Text — Cohere: Near Black + Muted Slate
  text: {
    primary:     '#212121',   // Cohere Near Black
    secondary:   '#6F6C74',   // 쿨-뉴트럴 보조 (이전 웜 브라운 → 쿨 슬레이트 방향)
    tertiary:    '#93939F',   // Cohere Muted Slate
    inverse:     '#FFFFFF',
    link:        '#84481F',   // 브랜드 링크 유지
    placeholder: '#B0B0B8',  // 쿨 플레이스홀더
  },

  // Status
  status: {
    quiet:   { bg: '#F2F2F2', text: '#6E5343' },
    active:  { bg: '#FFF3E8', text: '#A85E28' },
    mixed:   { bg: '#F0EEF8', text: '#6B5EA8' },
    recent:  { bg: '#FDEAD9', text: '#84481F' },
    success: { bg: '#EEF1EC', text: '#4D7A49' },
    warning: { bg: '#FFF8E8', text: '#B87C1A' },
    error:   { bg: '#FBF0F0', text: '#C7655B' },
    info:    { bg: '#F0EEF8', text: '#8C7BCA' },
  },

  // Safety
  safety: {
    private:       { bg: '#F2F2F2', text: '#6E5343', dot: '#93939F' },
    spotOnly:      { bg: '#FFF3E8', text: '#84481F', dot: '#C97432' },
    familiarLayer: { bg: '#F0EEF8', text: '#6B5EA8', dot: '#8C7BCA' },
  },

  // Map pin
  pin: {
    default: '#93939F',
    recent:  '#C97432',
    visited: '#A85E28',
    regular: '#84481F',
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
    other:     { bg: '#C4784822', icon: '#C47848' },  // 브랜드 (기타)
  },

  // ─────────────────────────────────────────
  // Onboarding — 슬라이드별 액센트 컬러
  //   다른 hue로 단계 차별화. accent와 호환 (브랜드 hue 변주)
  // 사용처: app/(auth)/onboarding.tsx
  // ─────────────────────────────────────────
  onboarding: {
    discover: '#3B82F6',  // 블루 (탐색)
    paw:      '#E76F35',  // 오렌지 (브랜드 변주)
    familiar: '#3B5BA9',  // 네이비 (안정)
    privacy:  '#84481F',  // 브랜드 accent (개인정보 — 신뢰감)
  },

  // Util
  overlay:      'rgba(33, 33, 33, 0.32)',   // Cohere Near Black 기반
  overlayLight: 'rgba(33, 33, 33, 0.06)',
  transparent:  'transparent',
};

// ─────────────────────────────────────────
// SPACING — Cohere 8px base unit
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
  22: 22,   // Cohere 시그니처 카드 패딩
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
// RADIUS — Cohere 22px 시그니처 시스템
// ─────────────────────────────────────────
export const Radius = {
  sharp:     4,    // 태그, 작은 배지
  s:         8,    // 다이얼로그, 보조 컨테이너
  m:        12,    // 중간 카드 내부 요소
  l:        16,    // Featured 컨테이너
  xl:       20,    // 큰 피처 카드
  card:     22,    // Cohere 시그니처 — 메인 카드/이미지/컨테이너
  round:  9999,    // Pill — 버튼, 칩, 상태 인디케이터
};

// ─────────────────────────────────────────
// SHADOW — Cohere: 거의 shadow-free. 깊이는 배경 대비와 보더로 표현.
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
    shadowColor: '#212121',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  // Level 3: 바텀시트/모달
  l: {
    shadowColor: '#212121',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  // 발도장 FAB — 브랜드 컬러 글로우 유지
  paw: {
    shadowColor: '#C97432',
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
  // Body — 표준 본문. Cohere 원칙: weight 400, size/spacing으로 계층 표현
  body: {
    l: { fontSize: 16, lineHeight: 26, fontWeight: '400' as const },   // 인트로 단락 (Cohere Body Large)
    m: { fontSize: 14, lineHeight: 22, fontWeight: '400' as const },   // 표준 본문
    s: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },   // 보조 설명
  },
  // Label — 작은 강조. Cohere: weight 500은 소형 버튼/강조 라벨만
  label: {
    l: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
    m: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
    s: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.2 }, // 코드/태그용 자간
  },
  // Caption — 메타데이터, 푸터 링크
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const, color: '#93939F' },
};

// ─────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────
export const Layout = {
  screenPadding: 16,
  cardPadding:   22,   // Cohere 시그니처 카드 내부 패딩 = 22px
  tabBarHeight:  60,
  headerHeight:  56,
  sectionGap:    56,   // 섹션 간 수직 여백 (Cohere: 56–60px)
};
