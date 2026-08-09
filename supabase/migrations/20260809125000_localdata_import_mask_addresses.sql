-- 마스킹된 주소 처리 — LOCALDATA는 업종에 따라 상세주소를 별표로 가린다
--
--   동물미용업: '서울특별시 종로구 대학로 **, *층 (연건동)'  ← 영업중 11,235건 전부(실측)
--   동물병원·동물약국: 마스킹 없음
--
-- 별표를 그대로 노출하면 "정보가 깨졌다"로 읽힌다. 첫 별표 앞에서 자르면
-- '서울특별시 종로구 대학로'까지 남아 쓸모가 있고, 좌표는 정확하므로
-- 지도 핀·길찾기(좌표 기반)에는 지장이 없다.
--
-- import_localdata_batch 본문은 20260809120000에서 이 함수를 쓰도록 갱신됐고,
-- 응답에 address_masked 카운트가 추가됐다.
create or replace function public.clean_masked_address(a text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select nullif(btrim(regexp_replace(coalesce(a, ''), '\*.*$', ''), ' ,.·-'), '');
$function$;

revoke all on function public.clean_masked_address(text) from public, anon, authenticated;
grant execute on function public.clean_masked_address(text) to service_role;
