-- get_spots_nearby / get_regular_spots 에 subcategory(공원구분) 반환 추가
--  · 목적: 클라이언트가 공원 유형별 커버 일러스트를 매핑할 수 있도록 subcategory를 실어 보낸다.
--  · RETURNS TABLE 컬럼 추가 = 반환 타입 변경 → CREATE OR REPLACE 불가, DROP 후 재생성.
--  · 권한(EXECUTE)은 기존과 동일하게 재부여 — 보안 posture 변경 없음.
--    (anon EXECUTE 회수는 보안 감사에서 나온 별도 이슈로, 이 마이그레이션 범위 아님.)

DROP FUNCTION IF EXISTS public.get_spots_nearby(double precision, double precision, integer, integer);
CREATE FUNCTION public.get_spots_nearby(
  p_lat double precision, p_lng double precision,
  p_radius_m integer DEFAULT 2000, p_limit integer DEFAULT 50)
 RETURNS TABLE(spot_id uuid, name text, category spot_category, subcategory text,
   latitude double precision, longitude double precision, address_text text,
   neighborhood text, cover_image_url text, distance_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.spot_id, s.name, s.category, s.subcategory, s.latitude, s.longitude,
    s.address_text, s.neighborhood, s.cover_image_url,
    ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m
  FROM spots s
  WHERE s.status = 'active'
    AND ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  ORDER BY distance_m ASC LIMIT p_limit;
$function$;
GRANT EXECUTE ON FUNCTION public.get_spots_nearby(double precision, double precision, integer, integer)
  TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_regular_spots(uuid);
CREATE FUNCTION public.get_regular_spots(p_dog_id uuid)
 RETURNS TABLE(spot_id uuid, name text, category spot_category, subcategory text,
   latitude double precision, longitude double precision, neighborhood text,
   visit_count integer, last_visit_at timestamp with time zone, regular_status regular_status)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT sp.spot_id, sp.name, sp.category, sp.subcategory, sp.latitude, sp.longitude, sp.neighborhood,
    svs.visit_count, svs.last_visit_at, svs.regular_status
  FROM spot_visit_summaries svs
  JOIN spots sp ON svs.spot_id = sp.spot_id
  WHERE svs.dog_id = p_dog_id AND svs.regular_status IN ('candidate','regular') AND sp.status = 'active'
  ORDER BY CASE svs.regular_status WHEN 'regular' THEN 0 ELSE 1 END, svs.last_visit_at DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_regular_spots(uuid)
  TO anon, authenticated, service_role;
