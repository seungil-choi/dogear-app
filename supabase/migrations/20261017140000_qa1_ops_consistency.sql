-- QA 1사이클(2026-10-17) 운영·어드민 정합성 보정
--
-- ① 위치정보 이용사실 확인자료: 발도장 트리거가 앱 ID(users.user_id)로, 주변 검색은 auth.uid()로 적어
--    같은 표에 ID 종류가 섞였다 → 트리거를 auth_id로, 기존 행도 옮긴다(탈퇴로 짝이 없는 행은 그대로).
create or replace function public.log_location_access_on_checkin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    insert into public.location_access_logs (user_id, purpose)
    select u.auth_id, 'proximity_checkin'
      from public.dogs d join public.users u on u.user_id = d.user_id
     where d.dog_id = new.dog_id;
  exception when others then
    raise warning 'location_access_log insert failed: %', sqlerrm;
  end;
  return new;
end;
$$;
update public.location_access_logs l set user_id = u.auth_id
  from public.users u
 where l.purpose = 'proximity_checkin' and l.user_id = u.user_id;

-- ② 어드민: 강아지 없이 낸 신고(reporter_user_id)도 익명화·집계에 포함, 로그인 수단 표시 보정
--    (가입 트리거가 카카오를 'email'로 적는다 — 표시만 auth의 providers로 바로잡는다)
do $$
declare d text;
  v_old text := $r$coalesce(u.login_type::text,'unknown')$r$;
  v_new text := $r$(case when u.login_type::text = 'email' and jsonb_typeof(au.raw_app_meta_data->'providers') = 'array'
                     and jsonb_array_length(au.raw_app_meta_data->'providers') > 0
                then au.raw_app_meta_data->'providers'->>(jsonb_array_length(au.raw_app_meta_data->'providers') - 1)
                else coalesce(u.login_type::text,'unknown') end)$r$;
begin
  d := pg_get_functiondef('public.admin_list_users(text,text,integer,integer,text,text)'::regprocedure);
  if position(v_old in d) = 0 then raise exception 'admin_list_users: pattern not found'; end if;
  execute replace(d, v_old, v_new);

  d := pg_get_functiondef('public.admin_get_user(uuid)'::regprocedure);
  if position(v_old in d) = 0 then raise exception 'admin_get_user: pattern not found'; end if;
  d := replace(d, v_old, v_new);
  d := replace(d, $r$and r.reporter_dog_id in (select dog_id from public.dogs where user_id=u.user_id))$r$,
                  $r$and (r.reporter_dog_id in (select dog_id from public.dogs where user_id=u.user_id) or r.reporter_user_id=u.user_id))$r$);
  execute d;

  d := pg_get_functiondef('public.admin_anonymize_user(uuid,text)'::regprocedure);
  v_old := $r$where reporter_dog_id in (select dog_id from public.dogs where user_id=p_user_id);$r$;
  if position(v_old in d) = 0 then raise exception 'admin_anonymize_user: pattern not found'; end if;
  execute replace(d, v_old, $r$where reporter_dog_id in (select dog_id from public.dogs where user_id=p_user_id) or reporter_user_id = p_user_id;$r$);

  -- 대시보드 신고 대기 수를 사이드바(admin_queue_counts)와 같은 기준으로 — in_review 포함
  d := pg_get_functiondef('public.admin_dashboard_summary()'::regprocedure);
  d := replace(d, $r$target_type='spot' and status in ('pending','received')$r$, $r$target_type='spot' and status in ('pending','received','in_review')$r$);
  d := replace(d, $r$target_type='checkin' and status in ('pending','received')$r$, $r$target_type='checkin' and status in ('pending','received','in_review')$r$);
  execute d;
end $$;

-- ③ 30일 미처리 신고 자동 종료: P1(동물 학대·부적절·괴롭힘·개인정보)은 자동으로 닫지 않는다,
--    닫을 때는 사유를 남긴다
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'auto-close-stale-reports'),
  command := $c$
    update public.reports
       set status = 'rejected', resolved_at = now(),
           resolution_note = coalesce(resolution_note, '30일 미처리 자동 종료(P2·P3)')
     where status = 'pending'
       and created_at < now() - interval '30 days'
       and report_type not in ('animal_abuse','inappropriate_content','harassment','privacy_violation');
  $c$);

-- ④ 기능 스위치를 어드민에서 켜고 끈다(super_admin, 기록 남김). 표에 쓰기 정책은 두지 않는다.
create or replace function public.admin_set_app_flag(p_key text, p_enabled boolean, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_at_least('super_admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required' using errcode = '22023'; end if;
  update public.app_flags set enabled = p_enabled, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown flag' using errcode = 'P0002'; end if;
  insert into public.admin_action_logs (actor_admin_id, target_type, target_id, action_type, reason, metadata)
  values (auth.uid(), 'app_flag', md5('app_flag:' || p_key)::uuid, 'set_app_flag', p_reason, jsonb_build_object('key', p_key, 'enabled', p_enabled));
end;
$$;
revoke execute on function public.admin_set_app_flag(text, boolean, text) from public, anon;
grant execute on function public.admin_set_app_flag(text, boolean, text) to authenticated;
revoke truncate on public.app_flags from anon, authenticated;

-- ⑤ 발도장 트리거도 10분 안의 같은 기록은 건너뛴다 — paw-checkin 함수가 시도마다 먼저 남기므로
--    성공 건이 두 번 남지 않게(log_location_access와 같은 규칙)
create or replace function public.log_location_access_on_checkin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    insert into public.location_access_logs (user_id, purpose)
    select u.auth_id, 'proximity_checkin'
      from public.dogs d join public.users u on u.user_id = d.user_id
     where d.dog_id = new.dog_id
       and not exists (
         select 1 from public.location_access_logs l
          where l.user_id = u.auth_id and l.purpose = 'proximity_checkin'
            and l.created_at > now() - interval '10 minutes');
  exception when others then
    raise warning 'location_access_log insert failed: %', sqlerrm;
  end;
  return new;
end;
$$;
