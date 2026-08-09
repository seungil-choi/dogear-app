#!/usr/bin/env node
/**
 * 공공데이터 CSV → spots 적재
 *
 * 사용:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/import-localdata.mjs \
 *     --file ~/Downloads/동물병원.csv --category vet --source localdata_vet [--commit]
 *
 * 기본은 드라이런이다. --commit을 붙여야 실제로 쓴다.
 *
 * 이 스크립트가 하는 일은 파싱뿐이다.
 *   좌표계 변환(EPSG:5174→WGS84)·폐업 제외·근접중복 판정·업서트는 전부
 *   DB의 import_localdata_batch()가 한다. PostGIS가 있는 쪽에서 하는 게 맞고,
 *   여기서 하면 proj4 의존이 붙는 데다 결과를 검증할 방법이 없다.
 *
 * ⚠️ 컬럼명은 LOCALDATA 표준 스키마를 기준으로 별칭 목록을 두고 찾는다.
 *    못 찾으면 실제 헤더를 그대로 출력하고 멈춘다 — 조용히 빈 값으로 넣지 않는다.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ncargfjnfsabmdwmegyn.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** CSV 헤더 별칭 — 앞에 있는 것부터 찾는다 */
const COLUMN_ALIASES = {
  external_id:        ['관리번호', '개방자치단체코드관리번호', 'MGTNO'],
  biz_name:           ['사업장명', '업소명', '상호명', 'BPLCNM'],
  status_name:        ['영업상태명', '영업상태구분명', 'TRDSTATENM'],
  detail_status_name: ['상세영업상태명', 'DTLSTATENM'],
  road_addr:          ['도로명전체주소', '도로명주소', 'RDNWHLADDR'],
  lot_addr:           ['소재지전체주소', '지번주소', 'SITEWHLADDR'],
  phone:              ['소재지전화', '전화번호', 'SITETEL'],
  coord_x:            ['좌표정보(x)', '좌표정보(X)', '좌표정보x(epsg5174)', 'X', 'x'],
  coord_y:            ['좌표정보(y)', '좌표정보(Y)', '좌표정보y(epsg5174)', 'Y', 'y'],
};
/** 이게 없으면 적재해봐야 지도에 안 찍히거나 이름이 없다 */
const REQUIRED = ['biz_name', 'coord_x', 'coord_y'];

const VALID_CATEGORIES = ['vet', 'pet_grooming', 'pet_boarding', 'pet_cafe'];

function parseArgs(argv) {
  const out = { commit: false, print: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') out.commit = true;
    else if (a === '--print') out.print = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

/** RFC4180 최소 구현 — 따옴표 안의 쉼표·개행·이스케이프된 따옴표를 처리한다 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * LOCALDATA CSV는 CP949(EUC-KR)로 내려오는 경우가 많다.
 * UTF-8로 읽어 깨짐(U+FFFD)이 보이면 CP949로 다시 읽는다.
 */
function readText(path) {
  const buf = readFileSync(path);
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' };
  try {
    return { text: new TextDecoder('euc-kr').decode(buf), encoding: 'euc-kr' };
  } catch {
    return { text: utf8, encoding: 'utf-8(깨짐 있음)' };
  }
}

const norm = (s) => s.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '');

function resolveColumns(header) {
  const normalized = header.map(norm);
  const idx = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const at = normalized.indexOf(norm(alias));
      if (at !== -1) { idx[key] = at; break; }
    }
  }
  const missing = REQUIRED.filter((k) => idx[k] === undefined);
  if (missing.length) {
    console.error(`\n필수 컬럼을 찾지 못했습니다: ${missing.join(', ')}`);
    console.error('\n파일의 실제 헤더:');
    header.forEach((h, i) => console.error(`  [${i}] ${h}`));
    console.error('\nCOLUMN_ALIASES에 실제 이름을 추가한 뒤 다시 실행하세요.');
    process.exit(1);
  }
  return idx;
}

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args.category || !args.source) {
    console.error('사용: node scripts/import-localdata.mjs --file <csv> --category <vet|pet_grooming|pet_boarding|pet_cafe> --source <external_source> [--commit]');
    process.exit(1);
  }
  if (!VALID_CATEGORIES.includes(args.category)) {
    console.error(`--category는 ${VALID_CATEGORIES.join(' | ')} 중 하나여야 합니다.`);
    process.exit(1);
  }
  if (!SERVICE_KEY && !args.print) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. (staging 테이블·적재 RPC는 service_role 전용)');
    console.error('DB 없이 컬럼 매핑만 확인하려면 --print 를 쓰세요.');
    process.exit(1);
  }

  const { text, encoding } = readText(args.file);
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) { console.error('데이터 행이 없습니다.'); process.exit(1); }

  const idx = resolveColumns(rows[0]);
  console.log(`파일 ${args.file}`);
  console.log(`인코딩 ${encoding} · 데이터 ${rows.length - 1}행`);

  const pick = (r, k) => (idx[k] === undefined ? null : (r[idx[k]] ?? '').trim() || null);
  const batchId = randomUUID();
  const records = rows.slice(1).map((r, i) => ({
    batch_id: batchId,
    row_no: i + 1,
    category: args.category,
    // 관리번호가 없으면 업서트 키가 없다 → 파일 내 행번호로 대체하면 다음 파일에서
    // 순서가 바뀌는 순간 엉뚱한 행을 덮어쓴다. 차라리 null로 두고 RPC가 건너뛰게 한다.
    external_id: pick(r, 'external_id'),
    biz_name: pick(r, 'biz_name'),
    status_name: pick(r, 'status_name'),
    detail_status_name: pick(r, 'detail_status_name'),
    road_addr: pick(r, 'road_addr'),
    lot_addr: pick(r, 'lot_addr'),
    phone: pick(r, 'phone'),
    coord_x: num(pick(r, 'coord_x')),
    coord_y: num(pick(r, 'coord_y')),
  }));

  const noExternalId = records.filter((r) => !r.external_id).length;
  if (noExternalId) {
    console.warn(`⚠️ 관리번호 없는 행 ${noExternalId}건 — 업서트 키가 없어 적재에서 제외됩니다.`);
  }

  if (args.print) {
    // DB에 붙기 전에 컬럼 매핑이 맞았는지 눈으로 확인하는 용도.
    // 공공데이터 CSV는 배포 회차마다 헤더가 조금씩 달라진다.
    console.log('\n=== 컬럼 매핑 ===');
    for (const [k, at] of Object.entries(idx)) console.log(`  ${k.padEnd(20)} ← [${at}] ${rows[0][at]}`);
    console.log('\n=== 파싱 결과 (앞 5행) ===');
    console.log(JSON.stringify(records.slice(0, 5), null, 2));
    console.log('\n--print 모드라 DB에 접속하지 않았습니다.');
    return;
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  console.log(`staging 적재 중… (batch ${batchId})`);
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await db.from('localdata_staging').insert(records.slice(i, i + CHUNK));
    if (error) { console.error('staging 적재 실패:', error.message); process.exit(1); }
    process.stdout.write(`\r  ${Math.min(i + CHUNK, records.length)} / ${records.length}`);
  }
  console.log('');

  try {
    const { data, error } = await db.rpc('import_localdata_batch', {
      p_batch_id: batchId, p_source: args.source, p_dry_run: !args.commit,
    });
    if (error) { console.error('적재 RPC 실패:', error.message); process.exit(1); }
    console.log(args.commit ? '\n=== 적재 결과 ===' : '\n=== 드라이런 (아무것도 쓰지 않음) ===');
    console.log(JSON.stringify(data, null, 2));
    if (!args.commit) console.log('\n실제로 쓰려면 --commit 을 붙여 다시 실행하세요.');
  } finally {
    // staging은 원본 그대로라 남겨둘 이유가 없다. 성공·실패 무관하게 치운다.
    await db.from('localdata_staging').delete().eq('batch_id', batchId);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
