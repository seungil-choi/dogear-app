-- ====================================================================
-- 장소 제안에 대표 사진 컬럼 추가
-- 사용자가 장소 제안 시 사진 1장 첨부 가능 (Phase 1)
-- 어드민 검토 후 spots.cover_image_url로 이관됨
-- ====================================================================

ALTER TABLE spot_suggestions
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN spot_suggestions.cover_image_url IS
  '제안자가 첨부한 대표 사진 URL (Supabase Storage 또는 외부). 검토 후 spots.cover_image_url로 이관';
