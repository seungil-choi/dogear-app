-- SEC-17: 신고 이력이 있는 사용자의 탈퇴가 실패하던 문제
--  · reports.reporter_dog_id → dogs(dog_id) FK가 ON DELETE NO ACTION + NOT NULL이라,
--    계정삭제(dogs hard-delete) 시 이 FK가 막아 삭제 전체가 500으로 실패했다(dogs 참조 FK 중 유일).
--  · SET NULL + nullable로 전환: 신고 레코드는 보존(모더레이션 유지)하되 신고자 링크만 해제(익명화).

ALTER TABLE public.reports ALTER COLUMN reporter_dog_id DROP NOT NULL;
ALTER TABLE public.reports DROP CONSTRAINT reports_reporter_dog_id_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_reporter_dog_id_fkey
  FOREIGN KEY (reporter_dog_id) REFERENCES dogs(dog_id) ON DELETE SET NULL;
