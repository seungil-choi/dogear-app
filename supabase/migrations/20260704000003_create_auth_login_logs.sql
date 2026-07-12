-- 어드민 로그인 시도 로그 테이블 (2026-07-04 라이브 적용)
-- 어드민 코드(lib/supabase/login-log.ts)가 auth_login_logs에 기록하나 테이블이 없어
-- 로깅이 조용히 실패하던 것 복구. 인증 전(실패/차단)에도 남겨야 해 anon/authenticated INSERT 허용,
-- 조회는 관리자만.
create table if not exists public.auth_login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  ip text,
  user_agent text,
  fingerprint_hash text,
  geo jsonb,
  success boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_login_logs_created_idx on public.auth_login_logs (created_at desc);
create index if not exists auth_login_logs_email_idx on public.auth_login_logs (email);
alter table public.auth_login_logs enable row level security;
drop policy if exists auth_login_logs_insert on public.auth_login_logs;
create policy auth_login_logs_insert on public.auth_login_logs
  for insert to anon, authenticated with check (true);
drop policy if exists auth_login_logs_admin_select on public.auth_login_logs;
create policy auth_login_logs_admin_select on public.auth_login_logs
  for select to authenticated using (public.is_admin());
