-- 성능: FK 커버링 인덱스 추가 (어드바이저 unindexed_foreign_keys)
--  · 조인(블록 양방향 함수·familiar·saved) 및 cascade 삭제(계정삭제 시 자식 스캔) 경로 가속.
--  · ⚠️ 별도로 spots 등 주요 테이블에 ANALYZE 실행 필요(대량 적재 후 통계 낡음 → 잘못된 실행계획).
--    ANALYZE는 데이터 상태 작업이라 이 마이그레이션엔 포함하지 않음(autovacuum이 이후 유지).

CREATE INDEX IF NOT EXISTS blocks_blocked_dog_id_idx           ON public.blocks (blocked_dog_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_user_id_idx          ON public.blocks (blocked_user_id);
CREATE INDEX IF NOT EXISTS familiar_dog_signals_visible_dog_id_idx ON public.familiar_dog_signals (visible_dog_id);
CREATE INDEX IF NOT EXISTS saved_spots_spot_id_idx             ON public.saved_spots (spot_id);
CREATE INDEX IF NOT EXISTS reports_reporter_dog_id_idx         ON public.reports (reporter_dog_id);
CREATE INDEX IF NOT EXISTS media_moderation_queue_dog_id_idx   ON public.media_moderation_queue (dog_id);
CREATE INDEX IF NOT EXISTS media_moderation_queue_checkin_id_idx ON public.media_moderation_queue (checkin_id);
