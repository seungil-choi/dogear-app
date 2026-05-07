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
  children_park:     'park',
  nature_park:       'park',
};

function pick(p, keys) {
  for (const k of keys) if (p[k]) return p[k];
  return '';
}

/**
 * 공원명 풀네임 보정
 *  - 공공데이터의 공원명이 짧은 경우 (예: "희망", "샘물") → "희망 어린이공원" 식으로 결합
 *  - 이미 장소 종류 단어("공원", "숲" 등)를 포함하면 그대로 유지
 *  - 동명 중복 시 동/구 접미를 붙여 구분 가능 (1차에서는 미적용)
 */
const PLACE_KEYWORDS = ['공원', '숲', '산책로', '놀이터', '광장', '동산', '저수지', '쉼터', '체육시설', '체육공원', '물놀이장', '키즈파크', '파크', '캠핑장'];
function fullName(p) {
  const name = String(p.place_name || '').trim();
  const type = String(p.raw_metadata?.original_park_type || '').trim();
  if (!name) return type || '공원';
  // 이미 장소 종류 단어 포함 → 그대로
  if (PLACE_KEYWORDS.some(kw => name.includes(kw))) return name;
  // 공원구분이 있으면 합치기
  if (type && type !== '기타') return `${name} ${type}`;
  // 기본 fallback: "이름공원"
  return `${name}공원`;
}

function describe(p, cat) {
  const n = p.region_sigungu || '';
  const sido = p.region_sido || '';
  const prefix = sido === '경기도' ? n : n;
  if (cat === 'riverside') return `${prefix} 수변 공원`;
  if (cat === 'trail')     return `${prefix} 산책로형 공원`;
  const subcat = p.subcategory || '';
  if (subcat === 'nature_park') return `${prefix} 도시자연공원`;
  if (subcat === 'small_park')  return `${prefix} 어린이공원`;
  return `${prefix} 소재 공식 등록 공원`;
}

function features(p, cat) {
  const f = [];
  const subcat = p.subcategory || '';
  if (cat === 'riverside') f.push('수변 인근');
  if (subcat === 'nature_park') f.push('자연 트레일');
  if (subcat === 'small_park')  f.push('어린이 친화');
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
  // 서울특별시 + 경기도 포함
  const TARGET_SIDOS = ['서울특별시', '경기도'];
  const filtered = parks.filter(p => TARGET_SIDOS.includes(p.region_sido));
  const seoulCnt = filtered.filter(p => p.region_sido === '서울특별시').length;
  const gyeonggiCnt = filtered.filter(p => p.region_sido === '경기도').length;
  console.log(`📥 ${parks.length}개 → 서울 ${seoulCnt}개 + 경기 ${gyeonggiCnt}개 = 총 ${filtered.length}개 변환`);

  const NOW = '2026-05-07T00:00:00+09:00';
  const stringify = (s) => JSON.stringify(s ?? '');

  const items = filtered.map(p => {
    const cat = SUBCAT[p.subcategory] ?? 'park';
    const addr = pick(p, ['address_road', 'address_lot']);
    const id = String(p.external_id || p.place_name).toLowerCase().replace(/-/g, '_');
    const cover = `https://picsum.photos/seed/${p.external_id || p.place_name}/400/300`;
    const displayName = fullName(p);
    const feats = features(p, cat).map(f => stringify(f)).join(', ');
    return `  {
    spot_id: 'spot_pk_${id}',
    name: ${stringify(displayName)},
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
  console.log(`✅ ${TARGET} 작성 완료 (${filtered.length} parks)`);
}

main();
