-- 1.0.2 보완 (2026-10-16)
--
-- ① 로그인하지 않은 사용자(anon)가 실행할 수 있던 SECURITY DEFINER 함수의 실행 권한을 회수한다.
--    Supabase는 anon·authenticated에 기본 EXECUTE를 따로 준다 — "revoke from public"만으로는
--    anon 권한이 남는다(보안 점검 anon_security_definer_function_executable 9건).
--    함수 안에서 권한을 다시 확인하므로 즉시 위험은 아니었지만, 문을 열어 둘 이유가 없다.
--    앱은 전부 로그인 후 호출하고, spot_public_stats는 spot-detail(service_role)이 부른다.
revoke execute on function public.admin_delete_user(uuid, text) from anon;
revoke execute on function public.my_moderation_actions() from anon;
revoke execute on function public.submit_appeal(uuid, text) from anon;
revoke execute on function public.log_location_access(text) from anon;
revoke execute on function public.spot_public_stats(uuid) from anon;
-- 트리거 함수: RPC로 부를 수는 없지만 같은 정리를 해 둔다
revoke execute on function public.sync_user_status_from_admin_state() from anon;
revoke execute on function public.fill_admin_action_actor_email() from anon;
revoke execute on function public.fill_admin_read_email() from anon;
revoke execute on function public.trg_spot_stats() from anon;

-- ② 공공데이터 공원 주간 동기화 일시 중지
--    5/11부터 23주 연속 'PUBLIC_DATA_PORTAL_KEY not set'으로 실패. 공원 데이터는 수동 적재로 유지 중이라
--    끄는 편이 대시보드의 '수집 실패' 경보를 진짜 경보로 되돌린다. 키를 등록하면 active := true로 다시 켠다.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'weekly-public-parks-sync'), active := false);

-- ③ 위 두 함수는 PUBLIC 경유로 anon이 여전히 실행할 수 있었다(적용 후 재검증에서 발견) → PUBLIC까지 회수
revoke execute on function public.my_moderation_actions() from public, anon;
revoke execute on function public.submit_appeal(uuid, text) from public, anon;
grant execute on function public.my_moderation_actions() to authenticated;
grant execute on function public.submit_appeal(uuid, text) to authenticated;
