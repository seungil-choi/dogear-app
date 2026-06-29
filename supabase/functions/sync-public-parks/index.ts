// Edge Function: sync-public-parks
// 공공데이터포털 전국 도시공원 표준데이터 OpenAPI를 호출해 spots에 upsert.
// pg_cron이 매주 호출. 자체 CRON_SECRET 헤더로 인증.
//
// 환경변수 (Supabase Functions Secrets):
//   CRON_SECRET                    cron 호출 인증용 임의 토큰 (★필수 — 미설정 시 모든 호출 거부)
//   PUBLIC_DATA_PORTAL_KEY         공공데이터포털 인증키 (선택 — 미설정 시 dry-run)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  자동 주입

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── 정규화 헬퍼 (place-ingestor의 park_normalizer.py를 TS로 포팅) ───
const SUBCATEGORY_MAP: Record<string, string> = {
  '근린공원': 'neighborhood_park', '도시공원': 'neighborhood_park',
  '도시자연공원': 'neighborhood_park', '도시자연공원구역': 'neighborhood_park',
  '수변공원': 'riverside_park', '하천공원': 'riverside_park',
  '강변공원': 'riverside_park', '호수공원': 'riverside_park',
  '어린이공원': 'small_park', '소공원': 'small_park',
  '쌈지공원': 'small_park', '마을공원': 'small_park',
  '체육공원': 'park_other', '역사공원': 'park_other',
  '문화공원': 'park_other', '묘지공원': 'park_other', '주제공원': 'park_other',
};

function mapSubcategory(rawType: string | null | undefined): string {
  if (!rawType) return 'park_other';
  const s = (rawType + '').trim();
  if (SUBCATEGORY_MAP[s]) return SUBCATEGORY_MAP[s];
  for (const [k, v] of Object.entries(SUBCATEGORY_MAP)) if (s.includes(k)) return v;
  return 'park_other';
}

function toSpotCategory(sub: string): string {
  if (sub === 'riverside_park') return 'riverside';
  if (sub === 'trail_park') return 'trail';
  return 'park';
}

function cleanText(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();
}

function parseCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidKoreanCoord(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

function extractRegion(addr: string): { sido: string; sigungu: string } {
  const parts = cleanText(addr).split(' ');
  return { sido: parts[0] || '', sigungu: parts[1] || '' };
}

// ─── 공공데이터포털 OpenAPI 호출 (페이지네이션) ───
async function fetchPublicParks(apiKey: string, perPage = 1000): Promise<unknown[]> {
  const all: unknown[] = [];
  let pageNo = 1;
  while (true) {
    const url = `https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api`
      + `?serviceKey=${encodeURIComponent(apiKey)}`
      + `&pageNo=${pageNo}&numOfRows=${perPage}&type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`OpenAPI ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
    const json = await res.json();
    const items = json?.response?.body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    const totalCount = Number(json?.response?.body?.totalCount ?? 0);
    if (all.length >= totalCount) break;
    pageNo += 1;
    if (pageNo > 200) break; // 안전장치 (최대 20만 건)
  }
  return all;
}

// ─── 메인 ───
serve(async (req) => {
  const startedAt = new Date();
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // 인증: CRON_SECRET 헤더 (fail-closed — 시크릿 미설정이면 모든 호출 거부)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ingestion_logs 시작 행
  const { data: logRow } = await supabase.from('ingestion_logs').insert({
    source: 'public_data_portal_park',
    trigger: req.headers.get('x-cron-secret') ? 'cron' : 'manual',
    status: 'running',
  }).select('log_id').single();
  const logId = logRow?.log_id;

  const finalize = async (patch: Record<string, unknown>) => {
    if (!logId) return;
    const finishedAt = new Date();
    await supabase.from('ingestion_logs').update({
      ...patch,
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    }).eq('log_id', logId);
  };

  try {
    const apiKey = Deno.env.get('PUBLIC_DATA_PORTAL_KEY');
    if (!apiKey) {
      await finalize({ status: 'failed', error_message: 'PUBLIC_DATA_PORTAL_KEY not set' });
      return new Response(JSON.stringify({
        ok: false, error: 'PUBLIC_DATA_PORTAL_KEY 환경변수 미설정',
        hint: 'Supabase Functions secrets에 PUBLIC_DATA_PORTAL_KEY를 추가하세요.',
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. 원본 수집
    const raw = await fetchPublicParks(apiKey);

    // 2. 정규화 + upsert (1000건씩 batch)
    const SOURCE = 'public_data_portal_park';
    let inserted = 0, updated = 0, invalid = 0, skipped = 0;
    const batch: Record<string, unknown>[] = [];

    for (const r of raw as Record<string, unknown>[]) {
      const name = cleanText(r['parkNm'] ?? r['park_nm'] ?? r['공원명']);
      const lat = parseCoord(r['latitude'] ?? r['위도']);
      const lng = parseCoord(r['longitude'] ?? r['경도']);
      const extId = cleanText(r['mgcNo'] ?? r['mngNo'] ?? r['관리번호']);
      const addr = cleanText(r['lnmAdres'] ?? r['rdnmadr'] ?? r['소재지지번주소'] ?? r['소재지도로명주소']);
      const parkType = cleanText(r['parkSe'] ?? r['공원구분']);

      if (!name || !isValidKoreanCoord(lat, lng) || !extId) {
        invalid += 1; continue;
      }
      const sub = mapSubcategory(parkType);
      const cat = toSpotCategory(sub);
      const { sido: _sido, sigungu } = extractRegion(addr);

      batch.push({
        external_source: SOURCE,
        external_id: extId,
        name,
        category: cat,
        // PostgREST는 PostGIS 타입을 직접 안 받으므로, 좌표 컬럼만 upsert.
        // location 컬럼은 트리거나 별도 SQL로 채우는 게 안전 (지금은 lat/lng만)
        latitude: lat,
        longitude: lng,
        address_text: addr || null,
        neighborhood: sigungu || null,
        status: 'active',
        created_source: 'seed',
      });

      if (batch.length >= 500) {
        const { error } = await supabase.from('spots').upsert(batch as never, {
          onConflict: 'external_source,external_id', ignoreDuplicates: false,
        });
        if (error) throw new Error(`upsert batch failed: ${error.message}`);
        inserted += batch.length; // 정확한 insert/update 구분은 RETURNING 필요 — 단순화
        batch.length = 0;
      }
    }
    if (batch.length) {
      const { error } = await supabase.from('spots').upsert(batch as never, {
        onConflict: 'external_source,external_id', ignoreDuplicates: false,
      });
      if (error) throw new Error(`upsert tail failed: ${error.message}`);
      inserted += batch.length;
    }

    // location(geography)은 spots_sync_location 트리거가 INSERT/UPDATE 시 lat/lng로 자동 채움
    //   → 별도 backfill 불필요(지도 근접 쿼리에 정상 노출).

    await finalize({
      status: 'success', raw_count: raw.length,
      inserted_count: inserted, updated_count: updated,
      invalid_count: invalid, skipped_count: skipped,
    });

    return new Response(JSON.stringify({
      ok: true, raw: raw.length, upserted: inserted, invalid,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = (err as Error).message ?? 'unknown error';
    await finalize({ status: 'failed', error_message: msg.slice(0, 500) });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
