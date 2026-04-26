-- ============================================================
-- DogEar — 초기 데이터베이스 스키마
-- 생성일: 2026-04-21
-- ============================================================

-- 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE dog_size AS ENUM ('small', 'medium', 'large');
CREATE TYPE dog_age_group AS ENUM ('puppy', 'adult', 'senior');
CREATE TYPE spot_category AS ENUM ('park', 'trail', 'riverside', 'rest_spot');
CREATE TYPE spot_status AS ENUM ('active', 'hidden', 'archived');
CREATE TYPE visibility_level AS ENUM ('private', 'spot_only', 'familiar_layer');
CREATE TYPE regular_status AS ENUM ('none', 'candidate', 'regular');
CREATE TYPE atmosphere_state AS ENUM ('quiet', 'active', 'mixed', 'unknown');
CREATE TYPE saved_type AS ENUM ('want_to_go', 'go_again');
CREATE TYPE feeling_tag AS ENUM (
  'quiet', 'good', 'many_dogs', 'come_back_again', 'noisy', 'good_for_short_rest'
);
CREATE TYPE created_source AS ENUM ('seed', 'admin', 'user_suggested');
CREATE TYPE checkin_source AS ENUM ('home', 'spot_detail', 'global_cta', 'spot_search');
CREATE TYPE user_status AS ENUM ('active', 'blocked', 'deleted');
CREATE TYPE login_type AS ENUM ('apple', 'google', 'email');

-- ============================================================
-- TABLES
-- ============================================================

-- ─── users ───────────────────────────────────────────────
CREATE TABLE users (
  user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id        UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_type     login_type NOT NULL DEFAULT 'apple',
  push_token     TEXT,
  status         user_status NOT NULL DEFAULT 'active',
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── dogs ────────────────────────────────────────────────
CREATE TABLE dogs (
  dog_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name               TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20),
  avatar_url         TEXT,
  size               dog_size NOT NULL,
  age_group          dog_age_group NOT NULL,
  temperament_tags   TEXT[] NOT NULL DEFAULT '{}',
  walking_style_tags TEXT[] NOT NULL DEFAULT '{}',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── spots ───────────────────────────────────────────────
CREATE TABLE spots (
  spot_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  category        spot_category NOT NULL,
  location        GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS 위치
  latitude        DOUBLE PRECISION NOT NULL,         -- 클라이언트용 복사
  longitude       DOUBLE PRECISION NOT NULL,
  address_text    TEXT,
  neighborhood    TEXT,
  cover_image_url TEXT,
  status          spot_status NOT NULL DEFAULT 'active',
  created_source  created_source NOT NULL DEFAULT 'seed',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── paw_checkins ────────────────────────────────────────
CREATE TABLE paw_checkins (
  checkin_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id                 UUID NOT NULL REFERENCES dogs(dog_id) ON DELETE CASCADE,
  spot_id                UUID NOT NULL REFERENCES spots(spot_id),
  checked_in_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feeling_tags           feeling_tag[] NOT NULL DEFAULT '{}',
  note                   TEXT CHECK (char_length(note) <= 200),
  photo_url              TEXT,
  visibility_level       visibility_level NOT NULL DEFAULT 'spot_only',
  source_type            checkin_source NOT NULL DEFAULT 'global_cta',
  is_valid_for_aggregate BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── saved_spots ─────────────────────────────────────────
CREATE TABLE saved_spots (
  saved_spot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id        UUID NOT NULL REFERENCES dogs(dog_id) ON DELETE CASCADE,
  spot_id       UUID NOT NULL REFERENCES spots(spot_id),
  saved_type    saved_type NOT NULL DEFAULT 'want_to_go',
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dog_id, spot_id)  -- 중복 저장 방지
);

-- ─── spot_visit_summaries ────────────────────────────────
CREATE TABLE spot_visit_summaries (
  summary_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id               UUID NOT NULL REFERENCES dogs(dog_id) ON DELETE CASCADE,
  spot_id              UUID NOT NULL REFERENCES spots(spot_id),
  first_visit_at       TIMESTAMPTZ NOT NULL,
  last_visit_at        TIMESTAMPTZ NOT NULL,
  visit_count          INTEGER NOT NULL DEFAULT 1 CHECK (visit_count >= 0),
  last_30d_visit_count INTEGER NOT NULL DEFAULT 0 CHECK (last_30d_visit_count >= 0),
  regular_status       regular_status NOT NULL DEFAULT 'none',
  last_visible_tags    feeling_tag[],
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dog_id, spot_id)
);

-- ─── familiar_dog_signals ────────────────────────────────
CREATE TABLE familiar_dog_signals (
  familiar_signal_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id                    UUID NOT NULL REFERENCES spots(spot_id),
  visible_dog_id             UUID NOT NULL REFERENCES dogs(dog_id) ON DELETE CASCADE,
  recent_visible_checkin_count INTEGER NOT NULL DEFAULT 0,
  recent_last_seen_at        TIMESTAMPTZ NOT NULL,
  exposure_allowed           BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spot_id, visible_dog_id)
);

-- ─── privacy_settings ────────────────────────────────────
CREATE TABLE privacy_settings (
  privacy_setting_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id                      UUID NOT NULL UNIQUE REFERENCES dogs(dog_id) ON DELETE CASCADE,
  default_visibility_level    visibility_level NOT NULL DEFAULT 'spot_only',
  allow_familiar_layer_exposure BOOLEAN NOT NULL DEFAULT TRUE,
  allow_future_reactions      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── reports (신고) ──────────────────────────────────────
CREATE TABLE reports (
  report_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_dog_id  UUID NOT NULL REFERENCES dogs(dog_id),
  target_type      TEXT NOT NULL CHECK (target_type IN ('checkin', 'spot')),
  target_id        UUID NOT NULL,
  report_type      TEXT NOT NULL CHECK (report_type IN (
    'wrong_location', 'inappropriate_photo', 'spam_note',
    'fake_checkin', 'personal_info', 'other'
  )),
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- 위치 기반 쿼리 (PostGIS GiST)
CREATE INDEX idx_spots_location ON spots USING GIST (location);
CREATE INDEX idx_spots_status ON spots (status);

-- 체크인 조회
CREATE INDEX idx_checkins_dog_id ON paw_checkins (dog_id, checked_in_at DESC);
CREATE INDEX idx_checkins_spot_recent ON paw_checkins (spot_id, checked_in_at DESC)
  WHERE is_valid_for_aggregate = TRUE;
CREATE INDEX idx_checkins_visibility ON paw_checkins (spot_id, visibility_level, checked_in_at DESC);

-- 방문 요약
CREATE INDEX idx_summaries_dog ON spot_visit_summaries (dog_id, last_visit_at DESC);
CREATE INDEX idx_summaries_spot ON spot_visit_summaries (spot_id);
CREATE INDEX idx_summaries_regular ON spot_visit_summaries (dog_id, regular_status);

-- 익숙한 강아지
CREATE INDEX idx_familiar_spot ON familiar_dog_signals (spot_id, exposure_allowed, recent_last_seen_at DESC);

-- 저장 스팟
CREATE INDEX idx_saved_dog ON saved_spots (dog_id, saved_at DESC);

-- 사용자
CREATE INDEX idx_users_auth_id ON users (auth_id);
CREATE INDEX idx_dogs_user_id ON dogs (user_id) WHERE is_active = TRUE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE paw_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_visit_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE familiar_dog_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- users: 본인만
CREATE POLICY "users_own" ON users FOR ALL
  USING (auth_id = auth.uid());

-- dogs: 본인 강아지만
CREATE POLICY "dogs_own" ON dogs FOR ALL
  USING (user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid()));

-- spots: 모든 인증 사용자 읽기 / 관리자만 쓰기
CREATE POLICY "spots_read_authenticated" ON spots FOR SELECT
  USING (auth.role() = 'authenticated' AND status = 'active');

-- paw_checkins: 본인만 CRUD
CREATE POLICY "checkins_own" ON paw_checkins FOR ALL
  USING (dog_id IN (
    SELECT d.dog_id FROM dogs d
    JOIN users u ON d.user_id = u.user_id
    WHERE u.auth_id = auth.uid()
  ));

-- saved_spots: 본인만
CREATE POLICY "saved_own" ON saved_spots FOR ALL
  USING (dog_id IN (
    SELECT d.dog_id FROM dogs d
    JOIN users u ON d.user_id = u.user_id
    WHERE u.auth_id = auth.uid()
  ));

-- spot_visit_summaries: 본인만
CREATE POLICY "summaries_own" ON spot_visit_summaries FOR ALL
  USING (dog_id IN (
    SELECT d.dog_id FROM dogs d
    JOIN users u ON d.user_id = u.user_id
    WHERE u.auth_id = auth.uid()
  ));

-- familiar_dog_signals: 인증 사용자 읽기 (6조건 필터는 Edge Function에서)
CREATE POLICY "familiar_read_authenticated" ON familiar_dog_signals FOR SELECT
  USING (auth.role() = 'authenticated' AND exposure_allowed = TRUE);

-- privacy_settings: 본인만
CREATE POLICY "privacy_own" ON privacy_settings FOR ALL
  USING (dog_id IN (
    SELECT d.dog_id FROM dogs d
    JOIN users u ON d.user_id = u.user_id
    WHERE u.auth_id = auth.uid()
  ));

-- reports: 본인 신고만 생성/조회
CREATE POLICY "reports_own_insert" ON reports FOR INSERT
  WITH CHECK (reporter_dog_id IN (
    SELECT d.dog_id FROM dogs d
    JOIN users u ON d.user_id = u.user_id
    WHERE u.auth_id = auth.uid()
  ));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- 발도장 저장 후 방문 요약 자동 갱신
CREATE OR REPLACE FUNCTION update_visit_summary()
RETURNS TRIGGER AS $$
DECLARE
  existing_summary spot_visit_summaries%ROWTYPE;
BEGIN
  SELECT * INTO existing_summary
  FROM spot_visit_summaries
  WHERE dog_id = NEW.dog_id AND spot_id = NEW.spot_id;

  IF NOT FOUND THEN
    -- 최초 방문
    INSERT INTO spot_visit_summaries (
      dog_id, spot_id, first_visit_at, last_visit_at,
      visit_count, last_30d_visit_count, regular_status, last_visible_tags
    ) VALUES (
      NEW.dog_id, NEW.spot_id, NEW.checked_in_at, NEW.checked_in_at,
      1, 1, 'none', NEW.feeling_tags
    );
  ELSE
    -- 재방문
    UPDATE spot_visit_summaries SET
      last_visit_at        = NEW.checked_in_at,
      visit_count          = existing_summary.visit_count + 1,
      last_30d_visit_count = (
        SELECT COUNT(*) FROM paw_checkins
        WHERE dog_id = NEW.dog_id
          AND spot_id = NEW.spot_id
          AND checked_in_at > NOW() - INTERVAL '30 days'
          AND is_valid_for_aggregate = TRUE
      ) + 1,
      last_visible_tags = CASE
        WHEN NEW.visibility_level != 'private' THEN NEW.feeling_tags
        ELSE existing_summary.last_visible_tags
      END,
      regular_status = CASE
        WHEN (existing_summary.visit_count + 1) >= 10
          OR (existing_summary.last_30d_visit_count + 1) >= 3 THEN 'regular'
        WHEN (existing_summary.last_30d_visit_count + 1) >= 2 THEN 'candidate'
        ELSE 'none'
      END::regular_status,
      updated_at = NOW()
    WHERE dog_id = NEW.dog_id AND spot_id = NEW.spot_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_visit_summary
  AFTER INSERT ON paw_checkins
  FOR EACH ROW
  WHEN (NEW.is_valid_for_aggregate = TRUE)
  EXECUTE FUNCTION update_visit_summary();

-- 신규 강아지 생성 시 프라이버시 설정 자동 생성
CREATE OR REPLACE FUNCTION create_default_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO privacy_settings (dog_id)
  VALUES (NEW.dog_id)
  ON CONFLICT (dog_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_privacy_settings
  AFTER INSERT ON dogs
  FOR EACH ROW
  EXECUTE FUNCTION create_default_privacy_settings();

-- auth.users 생성 시 users 레코드 자동 생성
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (auth_id, login_type)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.app_metadata->>'provider' = 'apple' THEN 'apple'
      WHEN NEW.app_metadata->>'provider' = 'google' THEN 'google'
      ELSE 'email'
    END::login_type
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();
