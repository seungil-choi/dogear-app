-- 감사로그 테이블 최소권한화 (Admin Adversarial Audit A-1 후속)
--
-- 배경:
--   auth_login_logs / admin_action_logs / admin_read_logs 세 테이블 모두
--   anon·authenticated에 INSERT/UPDATE/DELETE/TRUNCATE까지 부여돼 있었다.
--   지금은 RLS(SELECT 정책만 존재)가 막고 있으나, 정책이 하나라도 잘못 추가되거나
--   RLS가 비활성화되면 즉시 감사로그 위조·삭제가 가능해진다.
--
-- 조치:
--   - 쓰기 권한을 anon·authenticated에서 회수한다.
--     · auth_login_logs 는 service_role(rolbypassrls)로만 기록한다.
--     · admin_action_logs / admin_read_logs 는 record_admin_action / record_admin_read
--       (SECURITY DEFINER, 소유자 권한 실행)가 기록하므로 영향받지 않는다.
--   - anon의 SELECT도 회수한다(감사로그를 읽을 이유가 없음).
--   - authenticated의 SELECT는 유지 — 관리자 화면 조회가 RLS의 is_admin()으로 걸러진다.

revoke insert, update, delete, truncate, references, trigger
  on public.auth_login_logs   from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.admin_action_logs from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.admin_read_logs   from anon, authenticated;

revoke select on public.auth_login_logs   from anon;
revoke select on public.admin_action_logs from anon;
revoke select on public.admin_read_logs   from anon;
