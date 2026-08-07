-- 목록(지도/홈)용 스팟 묶음 집계를 DB에서 한 번에 끝낸다.
--
-- 왜:
--   spots-nearby는 paw_checkins를 두 번 조회했다.
--     ① 최근 48시간 spot_only 체크인 (분위기 태그용)
--     ② is_valid_for_aggregate이고 private 아닌 **모든** 체크인 (개수만 세려고)
--   ②는 시간 제한이 없어, 세는 것이 목적인데 행 전체를 앱까지 실어 날랐다.
--   스팟 150개에 체크인이 쌓이면 지도를 팬할 때마다 전량 전송이 된다.
--
--   집계는 DB에서 끝내고 스팟당 한 줄만 보낸다. 왕복도 2회 → 1회.
--
-- 주의: feeling_tags는 feeling_tag[] (enum 배열)이라 text[]로 캐스팅해서 내보낸다.

create or replace function public.spot_list_stats(
  p_spot_ids uuid[],
  p_recent_hours integer default 48
)
returns table (
  spot_id uuid,
  checkin_count integer,   -- 누적(비공개 제외)
  recent_tags text[]       -- 최근 p_recent_hours 시간의 공개(spot_only) 감정 태그 평탄화
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.spot_id,
    count(distinct c.checkin_id) filter (where c.visibility_level <> 'private')::int,
    coalesce(
      array_agg(t.tag::text order by c.checked_in_at desc) filter (
        where c.visibility_level = 'spot_only'
          and c.checked_in_at >= now() - make_interval(hours => p_recent_hours)
          and t.tag is not null
      ),
      '{}'::text[]
    )
  from public.paw_checkins c
  left join lateral unnest(c.feeling_tags) as t(tag) on true
  where c.spot_id = any(p_spot_ids)
    and c.is_valid_for_aggregate = true
  group by c.spot_id;
$$;

-- SECURITY DEFINER 함수는 재생성 시 anon·authenticated EXECUTE가 다시 붙는다(Supabase 기본 권한).
revoke all on function public.spot_list_stats(uuid[], integer) from public, anon, authenticated;
grant execute on function public.spot_list_stats(uuid[], integer) to service_role;

comment on function public.spot_list_stats(uuid[], integer) is
  '목록용 스팟 묶음 집계(누적 발도장 수 + 최근 감정 태그). 비공개 발도장 제외.';
