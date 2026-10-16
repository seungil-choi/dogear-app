-- 강아지를 아직 등록하지 않은 사용자도 신고할 수 있게 한다 (planning/38 P1-12)
-- 예전엔 앱이 강아지가 없으면 insert를 건너뛰고도 "접수했어요"를 띄웠다. 신고는 UGC 심사 필수 기능이다.
alter table public.reports add column if not exists reporter_user_id uuid references public.users(user_id) on delete set null;
drop policy if exists reports_own_insert on public.reports;
create policy reports_own_insert on public.reports
  for insert to authenticated
  with check (
    (reporter_dog_id is not null and reporter_dog_id in (
       select d.dog_id from public.dogs d join public.users u on d.user_id = u.user_id where u.auth_id = auth.uid()))
    or
    (reporter_dog_id is null and reporter_user_id in (
       select u.user_id from public.users u where u.auth_id = auth.uid()))
  );
