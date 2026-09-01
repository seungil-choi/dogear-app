-- 장소별 익명 누적 통계 (2026-09-01)
--
-- 왜: 장소의 "발도장 N"·"분위기"를 paw_checkins에서 실시간으로 세고 있었다.
--   그래서 **회원이 탈퇴하면 그 장소의 축적이 함께 증발**했다.
--   장소의 가치는 사람이 아니라 장소에 붙어야 한다.
--   개인정보처리방침 제3조 ②의 "단, 익명 통계 데이터는 분리 보관"이 이 표를 가리킨다.
--
-- 설계: **dog_id / user_id를 담지 않는다.** 누가 남겼는지 되짚을 수 없어야 익명이다.
--   - 탈퇴로 인한 삭제  → 유지  (DELETE 트리거를 두지 않는 것이 핵심)
--   - 어드민 숨김·무효  → 차감  (부적절한 기록이 장소 분위기를 오염시키면 안 된다)
--     어드민은 발도장을 DELETE하지 못하고 admin_status만 바꾸므로 이 구분이 성립한다.

create table if not exists spot_stats (
  spot_id          uuid primary key references spots(spot_id) on delete cascade,
  checkin_total    bigint      not null default 0,
  mood_counts      jsonb       not null default '{}'::jsonb,
  first_checkin_at timestamptz,
  last_checkin_at  timestamptz,
  updated_at       timestamptz not null default now()
);

comment on table spot_stats is
  '장소별 익명 누적 통계. 개인 식별자를 담지 않으며, 회원 탈퇴로 원본 발도장이 삭제돼도 유지된다.';
comment on column spot_stats.mood_counts is
  '분위기 태그별 누적 횟수 {"quiet": 3, ...}. 어드민 숨김 시에만 차감된다.';

create or replace function spot_stats_counts(r paw_checkins) returns boolean
language sql immutable as $$
  select r.is_valid_for_aggregate and r.admin_status = 'recorded';
$$;

create or replace function spot_stats_apply(p_spot uuid, p_tags text[], p_at timestamptz, p_delta int)
returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  insert into spot_stats (spot_id, checkin_total, first_checkin_at, last_checkin_at)
  values (p_spot, greatest(p_delta, 0), p_at, p_at)
  on conflict (spot_id) do update set
    checkin_total    = greatest(spot_stats.checkin_total + p_delta, 0),
    first_checkin_at = least(coalesce(spot_stats.first_checkin_at, p_at), p_at),
    last_checkin_at  = greatest(coalesce(spot_stats.last_checkin_at, p_at), p_at),
    updated_at       = now();

  foreach t in array coalesce(p_tags, '{}') loop
    update spot_stats set
      mood_counts = jsonb_set(mood_counts, array[t],
        to_jsonb(greatest(coalesce((mood_counts->>t)::int, 0) + p_delta, 0)), true),
      updated_at = now()
    where spot_id = p_spot;
  end loop;
end $$;
revoke execute on function spot_stats_apply(uuid, text[], timestamptz, int) from public;  -- PUBLIC EXECUTE 함정 회수

create or replace function trg_spot_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if spot_stats_counts(new) then
      perform spot_stats_apply(new.spot_id, new.feeling_tags, new.checked_in_at, 1);
    end if;
  elsif TG_OP = 'UPDATE' then
    if spot_stats_counts(old) and not spot_stats_counts(new) then
      perform spot_stats_apply(old.spot_id, old.feeling_tags, old.checked_in_at, -1);
    elsif not spot_stats_counts(old) and spot_stats_counts(new) then
      perform spot_stats_apply(new.spot_id, new.feeling_tags, new.checked_in_at, 1);
    end if;
  end if;
  return null;
end $$;
revoke execute on function trg_spot_stats() from public;

-- ⚠️ DELETE 트리거는 **일부러 두지 않는다.** 탈퇴로 원본이 지워져도 통계는 남아야 한다.
drop trigger if exists trg_spot_stats_ins on paw_checkins;
create trigger trg_spot_stats_ins after insert on paw_checkins
  for each row execute function trg_spot_stats();

drop trigger if exists trg_spot_stats_upd on paw_checkins;
create trigger trg_spot_stats_upd after update of admin_status, is_valid_for_aggregate on paw_checkins
  for each row execute function trg_spot_stats();

insert into spot_stats (spot_id, checkin_total, mood_counts, first_checkin_at, last_checkin_at)
select pc.spot_id,
       count(*),
       coalesce((select jsonb_object_agg(t, c) from (
          select tag as t, count(*) as c
          from paw_checkins p2, unnest(p2.feeling_tags) as tag
          where p2.spot_id = pc.spot_id and p2.is_valid_for_aggregate and p2.admin_status='recorded'
          group by tag) s), '{}'::jsonb),
       min(pc.checked_in_at), max(pc.checked_in_at)
from paw_checkins pc
where pc.is_valid_for_aggregate and pc.admin_status='recorded'
group by pc.spot_id
on conflict (spot_id) do nothing;

alter table spot_stats enable row level security;
drop policy if exists spot_stats_read on spot_stats;
create policy spot_stats_read on spot_stats for select to anon, authenticated using (true);
