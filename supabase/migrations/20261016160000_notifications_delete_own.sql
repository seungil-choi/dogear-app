-- 알림함 고도화 (planning/38 P0-3) — 사용자가 알림을 한 건씩 지울 수 있게 한다.
-- 지금까지는 본인 SELECT·UPDATE 정책만 있어 삭제가 불가능했다.
-- 넣기는 여전히 서버(엣지 함수·보안 정의자 함수)만 한다 — 클라이언트 INSERT 권한을 명시적으로 회수.
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id in (select users.user_id from public.users where users.auth_id = auth.uid()));
revoke insert, truncate on public.notifications from anon, authenticated;
