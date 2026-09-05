/**
 * ⚠️ import.meta 제거 플러그인이 왜 있나 (2026-09-05)
 *
 * 웹 번들이 아예 실행되지 않았다 — `SyntaxError: Cannot use 'import.meta' outside a module`.
 * 파싱 단계 오류라 try/catch로 잡히지 않고, 화면이 통째로 검게 뜬다.
 *
 * 출처는 우리 코드가 아니다. zustand의 devtools 미들웨어가 `import.meta.env`(Vite 문법)를
 * 쓰는데, useAppStore가 `zustand/middleware` **배럴**에서 persist를 가져오면서 devtools까지
 * 딸려 온다. Metro는 트리셰이킹을 하지 않아 안 쓰는 코드도 그대로 실린다.
 *
 * 네이티브(Hermes)에서는 문제가 드러나지 않아 오래 몰랐다. 웹으로 QA를 돌리려는
 * 순간에만 막힌다 — 그리고 그 QA가 실제로 레이아웃 버그를 잡는다(헤더 높이 0 사고).
 *
 * import.meta를 빈 객체로 바꾼다. RN/Expo 런타임에서 이걸 정상적으로 쓰는 코드는 없다.
 * `import.meta.env?.MODE` 같은 접근은 undefined가 되어 조용히 기본 분기를 탄다.
 *
 * ✅ 이 변경은 expo-updates fingerprint를 바꾸지 않는다(실측). 기존 APK의 OTA가 유지된다.
 */
function stripImportMeta({ types: t }) {
  return {
    name: 'strip-import-meta',
    visitor: {
      MetaProperty(path) {
        if (path.node.meta?.name === 'import') {
          path.replaceWith(t.objectExpression([]));
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin', stripImportMeta],
  };
};
