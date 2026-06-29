-- 보안 하드닝 (2026-06-29 apply_migration로 라이브 적용):
--  1) 앱 SECURITY DEFINER 함수 search_path 고정 (search_path 주입 방지)
--  2) 트리거/내부용 SECURITY DEFINER 함수의 EXECUTE를 anon/authenticated에서 회수
--     (트리거는 권한과 무관하게 발동, 엣지함수는 service_role로 호출 → 영향 없음)
--  3) admin_review_avatar는 anon/public 회수 + 관리자 세션(authenticated) 유지(내부 is_admin 가드)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname in ('create_default_privacy_settings','expire_familiar_dog_signals',
                        'get_regular_spots','get_spots_nearby','search_spots','update_visit_summary')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('update_visit_summary','create_default_privacy_settings',
                        'expire_familiar_dog_signals','handle_new_auth_user')
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='admin_review_avatar'
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- 스토리지 버킷 업로드 제한 (악성/대용량 업로드 차단). 라이브 동시 적용.
update storage.buckets
set file_size_limit = case id when 'dog-avatars' then 5242880 else 10485760 end,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id in ('dog-avatars','checkin-photos','spot-suggestions');
