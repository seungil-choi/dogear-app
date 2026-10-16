-- 유형 테스트 결과 — 강아지 단위 저장 (planning/34 1장, 1.1)
--
-- 보호자가 고른 성향(walking_style_tags·temperament_tags)과 섞지 않는다 — 테스트 결과는 별도 표.
-- 두 테스트에 같은 결과 키(sniff)가 있어 test_key와 함께 저장한다.
-- 다시 응시하면 새 행을 쌓는다(이력). 화면은 테스트별 최신 1건만 쓴다.
-- 결과 키는 한 번 정하면 바꾸지 않는다 — 아래 허용 목록이 그 약속이다.

create table if not exists public.dog_type_results (
  result_id       uuid primary key default gen_random_uuid(),
  dog_id          uuid not null references public.dogs(dog_id) on delete cascade,
  test_key        text not null,
  result_key      text not null,
  detail          jsonb not null default '{}'::jsonb,   -- 동점·보조 결과 등 (예: {"pair":"social","sub":"power"})
  content_version text,
  created_at      timestamptz not null default now(),
  constraint dog_type_results_key_ok check (
    (test_key = 'stroll'    and result_key in ('sniff', 'explorer', 'social', 'power', 'relaxed', 'regular')) or
    (test_key = 'happiness' and result_key in ('sniff', 'play', 'together', 'treat', 'discovery', 'rest'))
  )
);

create index if not exists idx_dog_type_results_latest
  on public.dog_type_results (dog_id, test_key, created_at desc);

alter table public.dog_type_results enable row level security;

-- 보호자 본인만 읽고 지운다. 쓰기는 save_dog_type_result()로만.
-- 다른 사용자에게 보이는 건 spot-detail 엣지 함수가 공개 설정을 확인한 뒤 내려준다(신원 노출 게이트 하나로).
drop policy if exists dog_type_results_own_read on public.dog_type_results;
create policy dog_type_results_own_read on public.dog_type_results
  for select to authenticated
  using (dog_id in (select d.dog_id from public.dogs d join public.users u on u.user_id = d.user_id
                     where u.auth_id = auth.uid()));

drop policy if exists dog_type_results_own_delete on public.dog_type_results;
create policy dog_type_results_own_delete on public.dog_type_results
  for delete to authenticated
  using (dog_id in (select d.dog_id from public.dogs d join public.users u on u.user_id = d.user_id
                     where u.auth_id = auth.uid()));

drop policy if exists dog_type_results_admin_read on public.dog_type_results;
create policy dog_type_results_admin_read on public.dog_type_results
  for select to authenticated
  using (public.is_admin());

revoke insert, update, truncate on public.dog_type_results from anon, authenticated;

create or replace function public.save_dog_type_result(
  p_dog_id uuid,
  p_test_key text,
  p_result_key text,
  p_detail jsonb default '{}'::jsonb,
  p_content_version text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.dogs d join public.users u on u.user_id = d.user_id
     where d.dog_id = p_dog_id and u.auth_id = auth.uid() and u.status = 'active'
       and coalesce(d.is_active, true)
  ) then
    raise exception '내 강아지에만 결과를 저장할 수 있습니다' using errcode = '42501';
  end if;
  if pg_column_size(coalesce(p_detail, '{}'::jsonb)) > 2000 then
    raise exception '결과 정보가 너무 큽니다';
  end if;
  insert into public.dog_type_results (dog_id, test_key, result_key, detail, content_version)
  values (p_dog_id, p_test_key, p_result_key, coalesce(p_detail, '{}'::jsonb), left(p_content_version, 40))
  returning result_id into v_id;
  return v_id;
end $$;

revoke execute on function public.save_dog_type_result(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.save_dog_type_result(uuid, text, text, jsonb, text) to authenticated;

comment on table public.dog_type_results is '유형 테스트 결과(planning/34). 강아지 단위·이력 누적·테스트별 최신 1건 표시. 다른 사용자 노출은 spot-detail 게이트 경유';
