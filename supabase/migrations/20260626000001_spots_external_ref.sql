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

-- 외부 출처 조합은 유일해야 함 (멱등 UPSERT의 충돌 대상).
-- ETL이 ON CONFLICT (...) WHERE external_source IS NOT NULL AND external_id IS NOT NULL
-- 형태로 UPSERT하므로, 동일 술어의 *부분 유니크 인덱스*가 필요하다.
-- (일반 UNIQUE 제약은 부분 ON CONFLICT와 매칭되지 않음)
CREATE UNIQUE INDEX IF NOT EXISTS spots_external_ref_unique
  ON spots (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

COMMENT ON COLUMN spots.external_source IS '외부 데이터 출처 (예: public_data_portal_park). 사용자 생성 장소는 NULL.';
COMMENT ON COLUMN spots.external_id     IS '출처 내 고유 ID (예: 11320-00026). external_source와 함께 멱등 키.';
