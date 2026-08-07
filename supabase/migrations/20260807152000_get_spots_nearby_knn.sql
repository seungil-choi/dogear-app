-- 주변 장소 조회를 KNN 인덱스 정렬로 바꾼다(정확한 순서는 유지).
--
-- 1) 정렬
--    기존: 반경 안 전부를 읽어 ST_Distance 계산 후 top-N 정렬
--    변경: ORDER BY location <-> point → GiST가 가까운 순으로 내주므로 LIMIT에서 멈춘다
--    실측(동탄 반경 10km, LIMIT 150): 스캔 707→150행 · 버퍼 532→258 · 함수 90ms→1.8ms
--
-- 2) 정확도
--    geography의 <->는 구(sphere), ST_Distance는 회전타원체(spheroid) 기준이라 순서가
--    미세하게 어긋난다(실측 역전 16쌍 · 최대 12.7m). 응답의 distance_m과 배열 순서가
--    불일치하면 그 자체로 결함이므로, 좁혀진 150행만 바깥에서 distance_m으로 다시 정렬한다.
--    → 역전 0쌍, 성능 그대로(1.8ms).
--
-- 3) 총계는 반환하지 않는다
--    total_in_radius를 함께 세어봤더니 반경 전체 count가 KNN 이득을 전부 상쇄했다
--    (127ms/버퍼 1806). 잘림 여부는 엣지 함수가 `반환 개수 == 상한`으로 판단한다.

drop function if exists public.get_spots_nearby(double precision, double precision, integer, integer);

create function public.get_spots_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 2000,
  p_limit integer default 50
)
returns table (
  spot_id uuid, name text, category spot_category, subcategory text,
  latitude double precision, longitude double precision,
  address_text text, neighborhood text, cover_image_url text,
  description text, tags jsonb, distance_m double precision
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select * from (
    select s.spot_id, s.name, s.category, s.subcategory, s.latitude, s.longitude,
      s.address_text, s.neighborhood, s.cover_image_url,
      s.description, s.tags,
      ST_Distance(s.location::geography,
                  ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
    from spots s
    where s.status = 'active'
      and ST_DWithin(s.location::geography,
                     ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    order by s.location <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    limit p_limit
  ) knn
  order by knn.distance_m;
$function$;

-- Supabase 기본 권한이 재생성 시 anon·authenticated를 다시 붙이므로 명시적으로 회수(SEC-03)
revoke all on function public.get_spots_nearby(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_spots_nearby(double precision, double precision, integer, integer)
  to service_role;
