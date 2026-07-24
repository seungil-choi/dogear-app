-- 동의 이력 서버 저장
--  · 목적: 신규/기존 판별의 단일 기준 + 동의 증빙(입증 책임은 사업자에게 있음)
--  · 로컬(zustand)만으로 판단하면 재설치 시 이력이 사라져 오판 → 서버를 기준으로 삼는다.
--  · 이 테이블이 없던 시절엔 소셜 신규 가입자가 약관 동의를 건너뛰고 진입했다.
create table if not exists public.consents (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  age_over_14   boolean     not null default false,
  terms         boolean     not null default false,
  privacy       boolean     not null default false,
  location      boolean     not null default false,
  marketing     boolean     not null default false,
  terms_version text        not null default 'v1',
  agreed_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.consents enable row level security;

create policy "consents_select_own" on public.consents
  for select using (auth.uid() = user_id);

create policy "consents_insert_own" on public.consents
  for insert with check (auth.uid() = user_id);

create policy "consents_update_own" on public.consents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
