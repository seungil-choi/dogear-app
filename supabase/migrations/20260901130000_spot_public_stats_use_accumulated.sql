-- 발도장 수만 누적 통계(spot_stats)에서 읽는다 (2026-09-01)
--
-- 지표마다 옳은 출처가 다르다:
--   발도장 수      → **누적**. 장소에 쌓인 발자국은 남긴 사람이 떠나도 남는 게 자연스럽다.
--   다녀간 강아지  → **실시간**. 없는 강아지를 세면 안 된다.
--   저장/단골 수   → **실시간**. 살아있는 관계 지표다.
--
-- greatest()로 하한을 거는 이유: spot_stats 도입 이전 데이터나 백필 누락이 있어도
-- 표시 수치가 실시간보다 작아지는 역전은 일어나지 않게 한다.

create or replace function public.spot_public_stats(p_spot_id uuid)
returns table(checkin_count integer, unique_dog_count integer,
              first_checkin_at timestamptz, last_checkin_at timestamptz,
              saved_count integer, regular_dog_count integer)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select
    greatest(coalesce(st.checkin_total, 0), coalesce(c.cnt, 0))::int,
    coalesce(c.dogs, 0)::int,
    least(coalesce(st.first_checkin_at, c.first_at), coalesce(c.first_at, st.first_checkin_at)),
    greatest(coalesce(st.last_checkin_at, c.last_at), coalesce(c.last_at, st.last_checkin_at)),
    coalesce(s.cnt, 0)::int,
    coalesce(r.cnt, 0)::int
  from (
    select
      count(*)               as cnt,
      count(distinct dog_id) as dogs,
      min(checked_in_at)     as first_at,
      max(checked_in_at)     as last_at
    from public.paw_checkins
    where spot_id = p_spot_id
      and is_valid_for_aggregate = true
      and visibility_level <> 'private'
  ) c
  left join public.spot_stats st on st.spot_id = p_spot_id
  cross join (
    select count(*) as cnt from public.saved_spots where spot_id = p_spot_id
  ) s
  cross join (
    select count(*) as cnt from public.spot_visit_summaries
    where spot_id = p_spot_id and regular_status = 'regular'
  ) r;
$function$;

revoke execute on function public.spot_public_stats(uuid) from public;   -- PUBLIC EXECUTE 함정 회수
grant  execute on function public.spot_public_stats(uuid) to anon, authenticated, service_role;
