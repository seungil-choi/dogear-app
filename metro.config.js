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

// ── react-native-maps 웹 shim ──────────────────────────────────
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'src/shims/react-native-maps.web.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
