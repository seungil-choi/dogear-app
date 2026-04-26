-- ============================================================
-- DogEar — RPC 함수 (Edge Function에서 호출)
-- ============================================================

/**
 * get_spots_nearby
 * PostGIS ST_DWithin으로 반경 내 스팟을 거리 순으로 반환
 */
CREATE OR REPLACE FUNCTION get_spots_nearby(
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION,
  p_radius_m INTEGER DEFAULT 2000,
  p_limit    INTEGER DEFAULT 50
)
RETURNS TABLE (
  spot_id         UUID,
  name            TEXT,
  category        spot_category,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  address_text    TEXT,
  neighborhood    TEXT,
  cover_image_url TEXT,
  distance_m      DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.spot_id,
    s.name,
    s.category,
    s.latitude,
    s.longitude,
    s.address_text,
    s.neighborhood,
    s.cover_image_url,
    ST_Distance(
      s.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_m
  FROM spots s
  WHERE
    s.status = 'active'
    AND ST_DWithin(
      s.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  ORDER BY distance_m ASC
  LIMIT p_limit;
$$;

-- 검색 함수 (텍스트 검색)
CREATE OR REPLACE FUNCTION search_spots(
  p_query    TEXT,
  p_category spot_category DEFAULT NULL,
  p_limit    INTEGER DEFAULT 20
)
RETURNS TABLE (
  spot_id         UUID,
  name            TEXT,
  category        spot_category,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  address_text    TEXT,
  neighborhood    TEXT,
  cover_image_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.spot_id,
    s.name,
    s.category,
    s.latitude,
    s.longitude,
    s.address_text,
    s.neighborhood,
    s.cover_image_url
  FROM spots s
  WHERE
    s.status = 'active'
    AND (
      s.name ILIKE '%' || p_query || '%'
      OR s.neighborhood ILIKE '%' || p_query || '%'
      OR s.address_text ILIKE '%' || p_query || '%'
    )
    AND (p_category IS NULL OR s.category = p_category)
  ORDER BY
    CASE WHEN s.name ILIKE p_query || '%' THEN 0 ELSE 1 END,
    s.name
  LIMIT p_limit;
$$;

-- 사용자의 단골 스팟 목록
CREATE OR REPLACE FUNCTION get_regular_spots(
  p_dog_id UUID
)
RETURNS TABLE (
  spot_id        UUID,
  name           TEXT,
  category       spot_category,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  neighborhood   TEXT,
  visit_count    INTEGER,
  last_visit_at  TIMESTAMPTZ,
  regular_status regular_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    sp.spot_id,
    sp.name,
    sp.category,
    sp.latitude,
    sp.longitude,
    sp.neighborhood,
    svs.visit_count,
    svs.last_visit_at,
    svs.regular_status
  FROM spot_visit_summaries svs
  JOIN spots sp ON svs.spot_id = sp.spot_id
  WHERE
    svs.dog_id = p_dog_id
    AND svs.regular_status IN ('candidate', 'regular')
    AND sp.status = 'active'
  ORDER BY
    CASE svs.regular_status WHEN 'regular' THEN 0 ELSE 1 END,
    svs.last_visit_at DESC;
$$;

-- 30일 익숙한 강아지 신호 만료 처리 (pg_cron으로 주기적 호출)
CREATE OR REPLACE FUNCTION expire_familiar_dog_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 30일 이상 신호 없는 것은 exposure_allowed = false 처리
  UPDATE familiar_dog_signals
  SET
    exposure_allowed = FALSE,
    updated_at = NOW()
  WHERE
    exposure_allowed = TRUE
    AND recent_last_seen_at < NOW() - INTERVAL '30 days';
END;
$$;

-- pg_cron으로 매일 새벽 3시 실행
SELECT cron.schedule(
  'expire-familiar-dog-signals',
  '0 3 * * *',
  $$SELECT expire_familiar_dog_signals()$$
);
