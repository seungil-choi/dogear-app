-- 장소 상세용 공개 집계 한 방 조회
--
-- 왜 RPC인가:
--   "발도장을 남긴 강아지 수"는 distinct 집계라 PostgREST로는 표현할 수 없다.
--   앱에서 dog_id를 전부 받아 중복 제거하면 인기 장소에서 수천 행을 끌어오게 된다.
--   집계는 DB에서 끝내고 숫자만 내려보낸다.
--
-- 무엇을 세는가:
--   비공개(private) 발도장은 어떤 집계에도 넣지 않는다.
--   is_valid_for_aggregate=false(어드민이 무효 처리)도 제외한다.

create or replace function public.spot_public_stats(p_spot_id uuid)
returns table (
  checkin_count     integer,
  unique_dog_count  integer,
  first_checkin_at  timestamptz,
  last_checkin_at   timestamptz,
  saved_count       integer,
  regular_dog_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(c.cnt, 0)::int,
    coalesce(c.dogs, 0)::int,
    c.first_at,
    c.last_at,
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
  cross join (
    select count(*) as cnt from public.saved_spots where spot_id = p_spot_id
  ) s
  cross join (
    select count(*) as cnt from public.spot_visit_summaries
    where spot_id = p_spot_id and regular_status = 'regular'
  ) r;
$$;

-- SECURITY DEFINER 함수는 기본으로 PUBLIC에 EXECUTE가 붙는다.
revoke all on function public.spot_public_stats(uuid) from public;
grant execute on function public.spot_public_stats(uuid) to authenticated, service_role;

comment on function public.spot_public_stats(uuid) is
  '장소 상세 화면용 공개 집계(발도장 수·강아지 수·저장 수·단골 수). private 발도장 제외.';
