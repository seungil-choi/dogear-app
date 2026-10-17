-- 서비스 이용 기록(events) 2년 보관 후 파기 (2026-10-17, 처리방침 2026.10.25 개정 3절⑧)
--
-- 그동안 events는 기한 없이 쌓였다. 개정 처리방침에 "수집일로부터 2년간 보관한 뒤 파기"를 적으면서
-- 실제 삭제를 붙인다. 탈퇴 시 회원 식별자 삭제는 events.user_id FK(on delete set null)가 이미 한다.
create or replace function public.purge_old_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  -- occurred_at은 기기 시각이라 서버 시각(created_at)으로 자른다
  delete from public.events where created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.purge_old_events() from public, anon, authenticated;

select cron.schedule('purge-old-events', '20 4 * * *', 'select public.purge_old_events()');
