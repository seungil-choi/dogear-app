-- ─────────────────────────────────────────────────────────────
-- spots 외부 출처 참조(external_source, external_id) 컬럼 추가
--
-- 목적:
--   place-ingestor가 공공데이터(공공데이터포털·서울 열린데이터)에서 수집한
--   장소를 멱등(idempotent)하게 적재하기 위함.
--   재실행 시 같은 외부 ID는 새 행을 만들지 않고 UPDATE만 되도록
--   ON CONFLICT (external_source, external_id) 의 충돌 대상이 된다.
--
-- 사용자 직접 생성 장소(suggest-spot 등)는 external_source/external_id = NULL.
--   Postgres 기본 UNIQUE는 NULL을 서로 구별하므로
--   (NULL, NULL) 행은 여러 개 존재 가능 — 사용자 생성 장소에 영향 없음.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE spots ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS external_id     TEXT;

-- 외부 출처 조합은 유일해야 함 (멱등 UPSERT의 충돌 대상)
ALTER TABLE spots
  ADD CONSTRAINT spots_external_ref_unique UNIQUE (external_source, external_id);

-- 외부 출처로 조회/관리 시 인덱스 활용 (부분 인덱스 — seed 행만)
CREATE INDEX IF NOT EXISTS idx_spots_external_source
  ON spots (external_source)
  WHERE external_source IS NOT NULL;

COMMENT ON COLUMN spots.external_source IS '외부 데이터 출처 (예: public_data_portal_park). 사용자 생성 장소는 NULL.';
COMMENT ON COLUMN spots.external_id     IS '출처 내 고유 ID (예: 11320-00026). external_source와 함께 멱등 키.';
