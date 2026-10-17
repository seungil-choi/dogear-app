-- QA 2사이클(2026-10-17) 정리
-- ① 위치정보 이용사실 확인자료는 정의자 함수로만 쓴다 — 일반 역할의 쓰기·TRUNCATE 권한 회수
--    (RLS가 막고 있었지만 TRUNCATE는 RLS 대상이 아니다). users도 남은 기본 권한 정리.
revoke insert, update, delete, truncate on public.location_access_logs from anon, authenticated;
revoke truncate, trigger, references on public.users from anon, authenticated;

-- ② 기능 스위치 변경 기록에 이전·이후 상태를 남기고, 오류는 운영자가 읽을 수 있게 한글로
create or replace function public.admin_set_app_flag(p_key text, p_enabled boolean, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before boolean;
begin
  if not public.is_admin_at_least('super_admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required' using errcode = '22023'; end if;
  select enabled into v_before from public.app_flags where key = p_key for update;
  if not found then raise exception '알 수 없는 기능 스위치입니다(%)', p_key using errcode = 'P0002'; end if;
  update public.app_flags set enabled = p_enabled, updated_at = now() where key = p_key;
  insert into public.admin_action_logs (actor_admin_id, target_type, target_id, action_type, from_status, to_status, reason, metadata)
  values (auth.uid(), 'app_flag', md5('app_flag:' || p_key)::uuid, 'set_app_flag',
          case when v_before then 'on' else 'off' end, case when p_enabled then 'on' else 'off' end,
          p_reason, jsonb_build_object('key', p_key));
end;
$$;
revoke execute on function public.admin_set_app_flag(text, boolean, text) from public, anon;
grant execute on function public.admin_set_app_flag(text, boolean, text) to authenticated;

-- ③ 30일 자동 종료 제외에 개인정보 노출·부적절 사진도 포함(어드민 우선순위 P1과 일치)
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'auto-close-stale-reports'),
  command := $c$
    update public.reports
       set status = 'rejected', resolved_at = now(),
           resolution_note = coalesce(resolution_note, '30일 미처리 자동 종료(P2·P3)')
     where status = 'pending'
       and created_at < now() - interval '30 days'
       and report_type not in ('animal_abuse','inappropriate_content','harassment','privacy_violation','personal_info','inappropriate_photo');
  $c$);
