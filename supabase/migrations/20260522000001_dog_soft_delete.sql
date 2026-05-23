-- =====================================================================
-- dog soft delete
-- =====================================================================
-- 강아지 삭제는 즉시 hard delete 하지 않고 deleted_at 타임스탬프 부여.
-- 30일 grace 기간 동안 복구 가능, 이후 cron 또는 어드민이 hard delete.
--
-- 클라이언트는 deleted_at IS NOT NULL 강아지를 모두 숨겨야 한다.
--   ( useAuth.loadUserProfile 에서 .is('deleted_at', null) 추가 )
--
-- TODO Phase 2 (출시 후):
--   1) 30일 경과 deleted_at → hard delete 처리하는 pg_cron 잡 추가
--   2) paw_checkins.dog_id FK 정책 검토 (ON DELETE SET NULL 으로 익명화)
--   3) familiar_dog_signals 등 의존 테이블 정리 정책
-- =====================================================================

ALTER TABLE dogs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN dogs.deleted_at IS
  'NULL = 활성. NOT NULL = soft deleted (30일 grace 후 hard delete 예정)';

-- 기존 인덱스가 is_active 만 필터링하므로, soft-deleted 강아지가 인덱스에 남는다.
-- 활성 + 미삭제 강아지만 빠르게 조회하도록 재정의.
DROP INDEX IF EXISTS idx_dogs_user_id;
CREATE INDEX idx_dogs_user_id_active
  ON dogs (user_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

-- 복구/cleanup 작업에서 deleted_at 기준 조회용
CREATE INDEX IF NOT EXISTS idx_dogs_deleted_at
  ON dogs (deleted_at)
  WHERE deleted_at IS NOT NULL;
