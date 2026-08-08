-- 정보 수정 제안(edit_suggestions) 테이블.
--
-- 발견 (코드 검토, 2026-08-08):
--   앱의 '정보 수정 제안'(장소 상세 ⋯ → app/info-correction.tsx)이 이 테이블에
--   INSERT하는데 테이블이 존재하지 않았다. useAppStore.suggestEdit()은 실패 시
--   throw하므로 사용자는 매번 오류를 봤다 — 기능이 한 번도 동작한 적이 없다.
--   어드민 대시보드의 place_edit_suggestion_pending도 TS 인터페이스에만 있고
--   admin_dashboard_summary가 계산하지 않아 항상 undefined였다.
--
--   앱이 부르는 테이블/RPC 이름을 DB와 전수 대조하다 드러났다.
--   (같은 방식으로 어드민 쪽 RPC 3개 누락도 나왔다 — dogear-admin 0023)
--
-- 컬럼은 앱이 실제로 보내는 것에 맞춘다.
--
-- ⚠️ 남은 일: 어드민에 검토 화면이 없다. 지금은 제안이 쌓이기만 하고
--    대시보드 카운터로만 보인다. 목록·처리 화면은 별건.
create table if not exists public.edit_suggestions (
  suggestion_id     uuid primary key default gen_random_uuid(),
  spot_id           uuid not null references public.spots(spot_id) on delete cascade,
  suggester_dog_id  uuid references public.dogs(dog_id) on delete set null,
  suggester_user_id uuid references public.users(user_id) on delete set null,
  field             text not null check (field in ('name','category','address','closed','other')),
  proposed_value    text not null default '',
  reason            text,
  status            text not null default 'pending'
                      check (status in ('pending','in_review','applied','rejected')),
  review_note       text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint edit_suggestions_value_len  check (char_length(proposed_value) <= 200),
  constraint edit_suggestions_reason_len check (reason is null or char_length(reason) <= 300)
);

create index if not exists edit_suggestions_status_idx  on public.edit_suggestions(status, created_at desc);
create index if not exists edit_suggestions_spot_idx    on public.edit_suggestions(spot_id);
create index if not exists edit_suggestions_user_idx    on public.edit_suggestions(suggester_user_id);

comment on table public.edit_suggestions is
  '사용자의 장소 정보 수정 제안. 앱 info-correction 화면에서 생성, 어드민이 검토.';

alter table public.edit_suggestions enable row level security;

-- 본인이 낸 제안만 INSERT.
-- users.user_id ≠ auth.uid()다(이 프로젝트의 ID 공간 2개 함정) — users를 거쳐 매핑한다.
drop policy if exists edit_suggestions_insert_own on public.edit_suggestions;
create policy edit_suggestions_insert_own on public.edit_suggestions
  for insert to authenticated
  with check (
    exists (select 1 from public.users u
             where u.user_id = edit_suggestions.suggester_user_id
               and u.auth_id = auth.uid())
    or exists (select 1 from public.dogs d
               join public.users u on u.user_id = d.user_id
              where d.dog_id = edit_suggestions.suggester_dog_id
                and u.auth_id = auth.uid())
  );

drop policy if exists edit_suggestions_select_own on public.edit_suggestions;
create policy edit_suggestions_select_own on public.edit_suggestions
  for select to authenticated
  using (
    exists (select 1 from public.users u
             where u.user_id = edit_suggestions.suggester_user_id
               and u.auth_id = auth.uid())
  );

drop policy if exists edit_suggestions_admin_all on public.edit_suggestions;
create policy edit_suggestions_admin_all on public.edit_suggestions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.edit_suggestions from anon;
grant select, insert on table public.edit_suggestions to authenticated;
grant all on table public.edit_suggestions to service_role;


-- 대시보드가 선언만 하고 계산하지 않던 place_edit_suggestion_pending을 실제로 채운다.
create or replace function public.admin_dashboard_summary()
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not public.is_admin() then raise exception 'forbidden: admin only' using errcode = '42501'; end if;
  select json_build_object(
    'place_suggestion_pending', (select count(*) from public.spot_suggestions where status in ('proposed','submitted')),
    'duplicate_candidate',      (select count(*) from public.duplicate_candidates where status = 'detected'),
    'place_report_pending',     (select count(*) from public.reports where target_type='spot' and status in ('pending','received')),
    'photo_report_pending',     (select count(*) from public.reports where target_type='checkin' and status in ('pending','received')),
    'place_edit_suggestion_pending',
                                (select count(*) from public.edit_suggestions where status in ('pending','in_review')),
    'today_pawmark',            (select count(*) from public.paw_checkins where created_at >= current_date),
    'latest_import',
      (select json_build_object('id', i.log_id, 'source_name', i.source, 'status', i.status,
                                'finished_at', i.finished_at, 'created_at', i.started_at)
       from public.ingestion_logs i order by i.started_at desc nulls last limit 1)
  ) into result;
  return result;
end; $$;

revoke all on function public.admin_dashboard_summary() from public, anon;
grant execute on function public.admin_dashboard_summary() to authenticated;
