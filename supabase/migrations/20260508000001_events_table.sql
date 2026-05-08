-- ====================================================================
-- 이벤트 트래킹 테이블 — 어드민 모니터링 지표용
-- 구현 지시문 §5~6 참조
-- ====================================================================

CREATE TABLE IF NOT EXISTS events (
  event_id        bigserial PRIMARY KEY,
  event_name      text NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),

  -- 사용자 / 강아지 / 세션 컨텍스트
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dog_profile_id  uuid,
  session_id      text,

  -- 화면 컨텍스트
  screen_name     text,
  source_screen   text,

  -- 장소 컨텍스트 (Dogear는 장소 중심 서비스)
  place_id        uuid,
  place_category  text,
  region_sido     text,
  region_sigungu  text,

  -- 자유 속성 (이벤트별 다른 메타)
  properties      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 인덱스 — 어드민 대시보드 쿼리 패턴
CREATE INDEX IF NOT EXISTS idx_events_occurred_at      ON events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_event_name_time  ON events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_id_time     ON events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_place_id         ON events (place_id);

-- ====================================================================
-- RLS — 사용자는 본인 이벤트 INSERT만 가능, 조회는 어드민 전용
-- ====================================================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 본인 이벤트 INSERT
CREATE POLICY "events_insert_own" ON events
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id  -- 인증 사용자
    OR (auth.uid() IS NULL AND user_id IS NULL)  -- 비로그인 게스트도 user_id NULL로 INSERT 허용
  );

-- 본인 이벤트만 SELECT (사용자 데이터 자기결정권)
CREATE POLICY "events_select_own" ON events
  FOR SELECT
  USING (auth.uid() = user_id);

-- (어드민은 service_role 키로 RLS 우회하여 전체 조회 — 별도 정책 불요)

-- ====================================================================
-- 어드민용 집계 뷰 — Phase 1 P1 지표
-- ====================================================================

-- 1) WAU — 최근 7일 활성 사용자
CREATE OR REPLACE VIEW v_admin_wau AS
SELECT
  date_trunc('week', occurred_at) AS week_start,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS wau
FROM events
WHERE occurred_at >= now() - interval '8 weeks'
GROUP BY week_start
ORDER BY week_start DESC;

-- 2) 주간 발도장 완료 사용자 수
CREATE OR REPLACE VIEW v_admin_weekly_pawmark_users AS
SELECT
  date_trunc('week', occurred_at) AS week_start,
  COUNT(DISTINCT user_id) AS pawmark_users
FROM events
WHERE event_name = 'pawmark_completed'
  AND occurred_at >= now() - interval '8 weeks'
GROUP BY week_start
ORDER BY week_start DESC;

-- 3) 가입 후 첫 발도장 완료율 — funnel
CREATE OR REPLACE VIEW v_admin_signup_to_first_pawmark AS
WITH signup AS (
  SELECT user_id, MIN(occurred_at) AS signed_up_at
  FROM events
  WHERE event_name = 'signup_completed' AND user_id IS NOT NULL
  GROUP BY user_id
),
first_paw AS (
  SELECT user_id, MIN(occurred_at) AS first_paw_at
  FROM events
  WHERE event_name = 'pawmark_completed' AND user_id IS NOT NULL
  GROUP BY user_id
)
SELECT
  COUNT(s.user_id) AS signups,
  COUNT(p.user_id) AS converted,
  ROUND(100.0 * COUNT(p.user_id) / NULLIF(COUNT(s.user_id), 0), 2) AS conversion_pct
FROM signup s
LEFT JOIN first_paw p ON s.user_id = p.user_id;

-- 4) 장소 상세 → 발도장 전환율 (장소별)
CREATE OR REPLACE VIEW v_admin_place_funnel AS
SELECT
  place_id,
  COUNT(*) FILTER (WHERE event_name = 'place_detail_viewed')   AS detail_views,
  COUNT(*) FILTER (WHERE event_name = 'place_saved')           AS saves,
  COUNT(*) FILTER (WHERE event_name = 'navigation_clicked')    AS nav_clicks,
  COUNT(*) FILTER (WHERE event_name = 'pawmark_completed')     AS pawmarks,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_name = 'pawmark_completed') /
    NULLIF(COUNT(*) FILTER (WHERE event_name = 'place_detail_viewed'), 0),
    2
  ) AS detail_to_pawmark_pct
FROM events
WHERE place_id IS NOT NULL
  AND occurred_at >= now() - interval '30 days'
GROUP BY place_id;

-- 5) 발도장 차단/실패 모니터링
CREATE OR REPLACE VIEW v_admin_pawmark_anomalies AS
SELECT
  date_trunc('day', occurred_at) AS day,
  COUNT(*) FILTER (WHERE event_name = 'pawmark_blocked_cooldown')    AS blocked_cooldown,
  COUNT(*) FILTER (WHERE event_name = 'pawmark_blocked_daily_limit') AS blocked_daily,
  COUNT(*) FILTER (WHERE event_name = 'pawmark_submit_failed')       AS submit_failed,
  COUNT(*) FILTER (WHERE event_name = 'suspicious_pawmark_pattern_detected') AS suspicious
FROM events
WHERE occurred_at >= now() - interval '30 days'
  AND event_name IN (
    'pawmark_blocked_cooldown',
    'pawmark_blocked_daily_limit',
    'pawmark_submit_failed',
    'suspicious_pawmark_pattern_detected'
  )
GROUP BY day
ORDER BY day DESC;
