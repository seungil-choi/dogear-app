-- 어드민 앱 푸시 발송 기록 (planning/37 확장 — 2026-10-16 승일님 요청)
--
-- 어드민에서 제목·본문을 직접 써서 보내는 푸시. 발송은 엣지 함수(admin-push)가 하고
-- 이 표는 "누가·언제·무엇을·몇 명에게" 보냈는지의 원장이다. 광고 발송의 동의 근거 추적도 여기서 한다.
-- 쓰기는 서비스 롤(엣지 함수)만. 어드민은 읽기만.

create table if not exists public.push_campaigns (
  campaign_id    uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('service', 'ad')),
  target         text not null check (target in ('all', 'test')),
  title          text not null,
  body           text not null,
  notice_id      uuid references public.notices(notice_id) on delete set null,
  link_path      text,
  save_inbox     boolean not null default true,
  recipients     integer,
  devices        integer,
  failed_batches integer,
  sent_by        uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index if not exists idx_push_campaigns_created on public.push_campaigns (created_at desc);

alter table public.push_campaigns enable row level security;

drop policy if exists push_campaigns_admin_read on public.push_campaigns;
create policy push_campaigns_admin_read on public.push_campaigns
  for select to authenticated
  using (public.is_admin_at_least('admin'));

revoke insert, update, delete, truncate on public.push_campaigns from anon, authenticated;

comment on table public.push_campaigns is '어드민 앱 푸시 발송 원장. 쓰기는 admin-push 엣지 함수(service_role)만';
