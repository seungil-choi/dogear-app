-- get_spots_nearby에 description·tags(편의시설)를 추가한다.
--
-- 왜:
--   DB에는 설명과 편의시설 태그(2,171곳)가 채워져 있는데 이 함수가 두 컬럼을
--   반환하지 않아 목록 카드까지 닿은 적이 없다.
--
-- 주의:
--   RETURNS TABLE 시그니처를 바꾸려면 CREATE OR REPLACE로는 안 되고 DROP이 필요하다.
--   SECURITY DEFINER 함수는 재생성 시 anon/authenticated EXECUTE가 다시 붙으므로
--   회수도 다시 해준다(SEC-03 — service_role 전용).

drop function if exists public.get_spots_nearby(double precision, double precision, integer, integer);

create function public.get_spots_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 2000,
  p_limit integer default 50
)
returns table (
  spot_id uuid,
  name text,
  category spot_category,
  subcategory text,
  latitude double precision,
  longitude double precision,
  address_text text,
  neighborhood text,
  cover_image_url text,
  description text,
  tags jsonb,
  distance_m double precision
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT s.spot_id, s.name, s.category, s.subcategory, s.latitude, s.longitude,
    s.address_text, s.neighborhood, s.cover_image_url,
    s.description, s.tags,
    ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m
  FROM spots s
  WHERE s.status = 'active'
    AND ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  ORDER BY distance_m ASC LIMIT p_limit;
$function$;

revoke all on function public.get_spots_nearby(double precision, double precision, integer, integer) from public;
revoke all on function public.get_spots_nearby(double precision, double precision, integer, integer) from authenticated;
grant execute on function public.get_spots_nearby(double precision, double precision, integer, integer) to service_role;
