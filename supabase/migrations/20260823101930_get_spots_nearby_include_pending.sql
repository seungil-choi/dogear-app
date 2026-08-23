-- 주변 조회에 pending(검토 중 사용자 제안)을 포함하고, status를 함께 내려준다.
--
-- status를 내리는 이유: 클라이언트가 '검토 중' 배지를 지도·목록에서도 붙여야 한다.
-- 지금까지는 상세 화면에만 배지가 있어서, 목록에서는 검토 중인지 알 수 없었다.
--
-- ⚠️ RETURNS TABLE이 바뀌므로 CREATE OR REPLACE로는 안 되고 DROP이 필요하다.
drop function if exists public.get_spots_nearby(double precision, double precision, integer, integer);

create function public.get_spots_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 2000,
  p_limit integer default 50
)
returns table(
  spot_id uuid, name text, category spot_category, subcategory text,
  latitude double precision, longitude double precision,
  address_text text, neighborhood text, cover_image_url text,
  description text, tags jsonb, distance_m double precision,
  status spot_status
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ),
  -- 시설만 열거한다. 나머지(공원·산책로·강변·쉼터·해변·기타·앞으로 추가될 것)는 전부 산책지.
  walk as (
    select s.*, st_distance(s.location::geography, o.g) as d
    from public.spots s, origin o
    where s.status in ('active'::spot_status, 'pending'::spot_status)
      and s.category not in ('pet_cafe','vet','pet_grooming','pet_boarding')
      and st_dwithin(s.location::geography, o.g, p_radius_m)
    order by s.location <-> o.g
    limit p_limit
  ),
  fac_cap as (
    select greatest(floor(p_limit * 0.4)::int, p_limit - (select count(*) from walk)::int) as n
  ),
  fac as (
    select s.*, st_distance(s.location::geography, o.g) as d
    from public.spots s, origin o
    where s.status in ('active'::spot_status, 'pending'::spot_status)
      and s.category in ('pet_cafe','vet','pet_grooming','pet_boarding')
      and st_dwithin(s.location::geography, o.g, p_radius_m)
    order by s.location <-> o.g
    limit (select n from fac_cap)
  ),
  merged as (select * from walk union all select * from fac)
  select m.spot_id, m.name, m.category, m.subcategory, m.latitude, m.longitude,
         m.address_text, m.neighborhood, m.cover_image_url,
         m.description, m.tags, m.d, m.status
  from merged m
  order by m.d
  limit p_limit;
$function$;

-- 이 함수는 엣지 함수(service_role)에서만 부른다. 재생성 시 되붙는 기본 권한을 회수한다.
revoke all on function public.get_spots_nearby(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_spots_nearby(double precision, double precision, integer, integer)
  to service_role;
