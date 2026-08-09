-- 트리거 함수 search_path 고정
--
-- 둘 다 SECURITY INVOKER라 권한 상승 경로는 아니지만, search_path가 열려 있으면
-- 호출자가 설정한 스키마에 따라 now()·ST_MakePoint 같은 이름이 다른 것으로 풀릴 수 있다.
-- 트리거는 모든 INSERT/UPDATE 경로에서 도므로 해석 대상을 못 박아 둔다.
-- (Supabase database linter: function_search_path_mutable)
--
-- 검증: 좌표만 주고 location에 (0,0)을 넣어도 트리거가 좌표로 덮어쓰는 것 확인.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin new.updated_at = now(); return new; end;
$function$;

create or replace function public.spots_sync_location()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'   -- PostGIS가 public에 설치돼 있다
as $function$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$function$;
