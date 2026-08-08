const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── macOS 메타데이터 파일 무시 (._* 패턴) ──────────────────────
const { blockList } = config.resolver ?? {};
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const projectRoot = escapeRegex(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.blockList = [
  // 기존 blockList 유지
  ...(Array.isArray(blockList) ? blockList : blockList ? [blockList] : []),
  // macOS 리소스 포크 파일 차단 (._filename) — 경로 어디에서든 매칭
  /\/\._[^/]*/,
];

// ── 데모 시드(2.94MB)는 DEV_SEED 빌드에만 ───────────────────────
// seedParkSpots.ts는 약 5,300개 공원의 목업 데이터다. 실서비스 빌드는 장소를
// 전부 Supabase에서 받으므로 한 건도 쓰지 않는데, mockData → useAppStore로
// 이어지는 정적 import 체인 때문에 번들에 통째로 실린다.
// IS_DEV_SEED는 런타임 값이라 Metro가 걷어낼 수 없으므로 해석 단계에서 바꿔치기한다.
// 실측(android hbc): 8.27MB → 7.35MB
const INCLUDE_DEV_SEED = process.env.EXPO_PUBLIC_DEV_SEED === 'true';
const EMPTY_SEED = path.resolve(__dirname, 'src/data/seedParkSpots.empty.ts');

// ── react-native-maps 웹 shim ──────────────────────────────────
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'src/shims/react-native-maps.web.js'),
      type: 'sourceFile',
    };
  }
  if (!INCLUDE_DEV_SEED && /(^|\/)seedParkSpots$/.test(moduleName)) {
    return { filePath: EMPTY_SEED, type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
