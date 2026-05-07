#!/usr/bin/env node
/**
 * place-ingestor 정규화 결과를 src/data/seedParkSpots.ts 로 변환
 *
 * 입력: ../Prj.17)DogEar/place-ingestor/outputs/normalized_parks.json
 * 출력: src/data/seedParkSpots.ts (overwrite)
 *
 * 실행:
 *   node scripts/import-parks.mjs
 *   node scripts/import-parks.mjs --src=/custom/path/to/normalized_parks.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT  = path.resolve(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const DEFAULT_SRC = path.resolve(
  PROJECT,
  '..', '..', 'Prj.17)DogEar', 'place-ingestor', 'outputs', 'normalized_parks.json',
);
const SRC    = args.src ?? DEFAULT_SRC;
const TARGET = path.resolve(PROJECT, 'src/data/seedParkSpots.ts');

const SUBCAT = {
  riverside_park:    'riverside',
  trail_park:        'trail',
  neighborhood_park: 'park',
  small_park:        'park',
  park_other:        'park',
};

function pick(p, keys) {
  for (const k of keys) if (p[k]) return p[k];
  return '';
}

function describe(p, cat) {
  const n = p.region_sigungu || '';
  if (cat === 'riverside') return `${n} 한강변 공원`;
  if (cat === 'trail')     return `${n} 산책로형 공원`;
  return `${n} 소재 공식 등록 공원`;
}

function features(p, cat) {
  const f = [];
  if (cat === 'riverside') f.push('한강 인근');
  if (p.subcategory && p.subcategory.includes('trail')) f.push('산책로 연결');
  const area = p.raw_metadata?.area_m2;
  if (area) {
    const a = Number(area);
    if (a >= 100000) f.push('넓은 공간');
    else if (a < 5000) f.push('아담한 규모');
  }
  return f;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`✗ 입력 파일 없음: ${SRC}`);
    console.error('  place-ingestor 실행 후 다시 시도하세요.');
    process.exit(1);
  }

  const parks = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
  // 1차 범위: 서울 (이후 region 옵션 추가 가능)
  const seoul = parks.filter(p => p.region_sido === '서울특별시');
  console.log(`📥 ${parks.length}개 → 서울 ${seoul.length}개 변환`);

  const NOW = '2026-05-01T00:00:00+09:00';
  const stringify = (s) => JSON.stringify(s ?? '');

  const items = seoul.map(p => {
    const cat = SUBCAT[p.subcategory] ?? 'park';
    const addr = pick(p, ['address_road', 'address_lot']);
    const id = String(p.external_id || p.place_name).toLowerCase().replace(/-/g, '_');
    const cover = `https://picsum.photos/seed/${p.external_id || p.place_name}/400/300`;
    const feats = features(p, cat).map(f => stringify(f)).join(', ');
    return `  {
    spot_id: 'spot_pk_${id}',
    name: ${stringify(p.place_name)},
    category: '${cat}',
    latitude: ${p.lat},
    longitude: ${p.lng},
    address_text: ${stringify(addr)},
    neighborhood: ${stringify(p.region_sigungu || '')},
    cover_image_url: '${cover}',
    opening_hours: '연중무휴 · 24시간 개방',
    features: [${feats}],
    description: ${stringify(describe(p, cat))},
    status: 'active',
    created_source: 'admin',
    created_at: '${NOW}',
  }`;
  });

  const out =
    `// 자동 생성 — place-ingestor 공공데이터포털 도시공원 표준데이터 정규화 결과\n` +
    `// 갱신: place-ingestor 재실행 후 \`node scripts/import-parks.mjs\` 실행\n` +
    `import type { Spot } from '../types';\n\n` +
    `export const seedParkSpots: Spot[] = [\n${items.join(',\n')}\n];\n`;

  fs.writeFileSync(TARGET, out);
  console.log(`✅ ${TARGET} 작성 완료 (${seoul.length} parks)`);
}

main();
