-- get_spots_nearby: 산책지와 시설에 따로 쿼터를 준다
--
-- 왜: 동물병원 5,244 + 애견미용 9,846을 적재하자 도심에서 상한(150)을 시설이 먹어
--     공원이 밀려났다.
--     실측 — 강남역 반경 2km: 산책지 53 · 병원 47 · 미용 80 (총 180).
--     한 덩어리 KNN으로 150개를 자르면 산책지는 37곳만 남고 반경도 1,769m에서 끊긴다.
--     산책 앱에서 공원이 사라지는 건 명백한 회귀다.
--
-- 어떻게: 시설 몫에 상한을 두되, 산책지가 드문 동네에서는 그만큼 시설이 채우게 한다.
--     fac_cap = max(상한의 40%, 상한 - 산책지 실제 개수)
--     최종 정렬은 예전과 같이 거리순이라 호출부는 바뀔 게 없다.
--
-- 수정 후 실측:
--     강남역   산책지 53(전부) · 총 150 · 반경 1,990m
--     노원역   산책지 16 + 시설 71 = 87 (산책지가 적어 시설이 전부 들어옴)
--     응답시간 전국 5~6ms (좌표를 흔들어 12회 반복, 캐시된 계획 기준)

create or replace function public.get_spots_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 2000,
  p_limit integer default 50
)
returns table(
  spot_id uuid, name text, category public.spot_category, subcategory text,
  latitude double precision, longitude double precision,
  address_text text, neighborhood text, cover_image_url text,
  description text, tags jsonb, distance_m double precision
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ),
  walk as (
    select s.*, st_distance(s.location::geography, o.g) as d
    from public.spots s, origin o
    where s.status = 'active'
      and s.category in ('park','trail','riverside','rest_spot','beach')
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
    where s.status = 'active'
      and s.category in ('pet_cafe','vet','pet_grooming','pet_boarding')
      and st_dwithin(s.location::geography, o.g, p_radius_m)
    order by s.location <-> o.g
    limit (select n from fac_cap)
  ),
  merged as (
    select * from walk
    union all
    select * from fac
  )
  select m.spot_id, m.name, m.category, m.subcategory, m.latitude, m.longitude,
         m.address_text, m.neighborhood, m.cover_image_url,
         m.description, m.tags, m.d
  from merged m
  order by m.d
  limit p_limit;
$function$;

-- ⚠️ Supabase는 함수를 새로 만들 때마다 anon/authenticated에 EXECUTE를 다시 부여한다.
--    이 함수는 엣지 함수(spots-nearby)만 호출한다 — SEC-03에서 회수한 상태를 유지한다.
revoke all on function public.get_spots_nearby(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_spots_nearby(double precision, double precision, integer, integer)
  to service_role;

comment on function public.get_spots_nearby(double precision, double precision, integer, integer) is
  '반경 내 활성 장소를 거리순으로. 산책지/시설에 별도 쿼터를 둬 시설 밀도가 높은 도심에서 공원이 상한 밖으로 밀리지 않게 한다. service_role 전용(엣지 함수 spots-nearby 경유).';
