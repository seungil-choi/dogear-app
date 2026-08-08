-- 강아지 프로필 신고를 실제로 접수한다.
--
-- 발견 (사용자 흐름 점검, 2026-08-08):
--   앱에는 이미 진입점이 있다 — 장소 상세의 '익숙한 강아지'를 탭하면
--   '이 강아지 신고하기'가 뜨고 target_type='dog'로 report 화면에 넘어간다.
--   (app/spot/[id].tsx handleReportDog)
--   그런데 reports.target_type CHECK가 ('checkin','spot')만 허용해서 INSERT가
--   23514로 거부된다. useAppStore.reportContent는 fire-and-forget이라
--   console.error만 남고 화면은 "신고 접수" 완료로 흘러간다.
--   즉 신고 경로가 없는 게 아니라 있는데 조용히 버려지고 있었다.
--   (차단은 blocks 테이블이라 정상 동작 → 사용자는 차단만 되고 신고는 유실)
--
-- 'user'는 넣지 않는다. report 화면에 분기는 있으나 그리로 보내는 화면이 없다.
-- 필요해지면 그때 넣는다.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['checkin'::text, 'spot'::text, 'dog'::text]));

comment on column public.reports.target_id is
  '신고 대상 id. target_type에 따라 spots.spot_id / paw_checkins.checkin_id / dogs.dog_id (다형 참조라 FK 없음)';

-- 처리 RPC(admin_dog_report_target / admin_resolve_dog_report / admin_reject_dog_report)는
-- 어드민 레포에 있다: dogear-admin/supabase/migrations/0027_dog_report_actions.sql
