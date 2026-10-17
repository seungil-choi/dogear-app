-- 사용자가 자기 users 행의 status(정지·탈퇴)를 API로 직접 바꿀 수 있었다(users_own = ALL, WITH CHECK 없음).
-- 정지된 사용자가 스스로 정지를 풀 수 있는 구멍. 앱이 쓰는 컬럼은 last_active_at 하나뿐 —
-- 나머지 쓰기 권한을 회수한다(2026-10-17 QA). 가입 행 생성은 트리거(definer), 삭제는 service_role.
revoke insert, update, delete on public.users from anon, authenticated;
grant update (last_active_at) on public.users to authenticated;
