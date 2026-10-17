-- consents.user_id는 auth.uid()다(앱 users.user_id가 아님). 이벤트(광고) 공지의 알림함 대상을
-- users.user_id로 찾아 늘 0명이었다(2026-10-17 QA) → admin_publish_notice의 조인을 auth_id로.
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and pg_get_functiondef(p.oid) like '%c.user_id = u.user_id and c.marketing_push%'
  loop
    d := pg_get_functiondef(r.oid);
    execute replace(d, 'c.user_id = u.user_id and c.marketing_push', 'c.user_id = u.auth_id and c.marketing_push');
  end loop;
end $$;
