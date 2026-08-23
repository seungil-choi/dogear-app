-- 운영 관측 두 가지: 오류 수집 + 신고 알림.
-- (MCP로 적용한 것을 파일로 남긴다 — 상세 주석은 DB의 함수/테이블 코멘트 참조)
--
-- ① client_errors — 앱·어드민 런타임 오류.
--    Sentry를 안 쓰는 이유: @sentry/react-native는 네이티브 모듈이라 지문이 바뀌어
--    설치된 APK가 OTA를 못 받게 된다. analytics.ts의 "비용 0 원칙"과도 맞지 않는다.
--    네이티브 크래시는 Play Console이 본다.
--
-- ② notify_admins_new_report — 신고 INSERT 시 운영자 폰으로 푸시.
--    send-push는 service_role 키를 요구하는데 그 키를 트리거 본문에 박으면
--    pg_proc를 읽는 누구에게나 노출된다. notify-admins 엣지 함수가 약한 공유 비밀만 받는다.
--    ⚠️ notify-admins는 **verify_jwt=false로 배포**해야 한다(트리거엔 사용자 토큰이 없다).
--       실제로 이것 때문에 첫 시도가 401 UNAUTHORIZED_NO_AUTH_HEADER로 막혔다.

create table if not exists public.client_errors (
  error_id     uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('app', 'admin')),
  kind         text not null,
  message      text not null,
  stack        text,
  screen       text,
  app_version  text,
  platform     text,
  os_version   text,
  is_fatal     boolean not null default false,
  user_id      uuid,
  created_at   timestamptz not null default now()
);

comment on table public.client_errors is
  '앱·어드민 런타임 오류. 개인정보 금지 — 메시지·스택·화면까지만.';

create index if not exists idx_client_errors_recent
  on public.client_errors (created_at desc);
create index if not exists idx_client_errors_source_recent
  on public.client_errors (source, created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert_any on public.client_errors;
create policy client_errors_insert_any on public.client_errors
  for insert to anon, authenticated with check (true);

drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read on public.client_errors
  for select to authenticated using (public.is_admin());

create or replace function public.purge_old_client_errors()
returns void language sql security definer
set search_path to 'public', 'pg_temp'
as $$ delete from public.client_errors where created_at < now() - interval '90 days'; $$;

revoke all on function public.purge_old_client_errors() from public, anon, authenticated;
-- cron: '15 4 * * *' purge-client-errors
