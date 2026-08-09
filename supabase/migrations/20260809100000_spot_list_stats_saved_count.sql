-- spot_list_stats에 saved_count 추가
--
-- 왜: 홈 '오늘의 추천' 카드의 저장 버튼을 장소 상세 키비주얼과 같은 표시로 맞추려면
--     목록 단계에서도 저장 수가 필요하다. 상세는 spot-detail이 내려주지만
--     목록(spots-nearby)에는 없어서 홈 카드만 숫자 없이 아이콘만 떠 있었다.
--
-- 왜 여기에: spots-nearby가 이미 이 RPC를 스팟 묶음당 1회 호출한다.
--     별도 쿼리를 더 붙이면 왕복이 늘어난다. 같은 호출에 컬럼 하나만 얹는다.
--     saved_spots(spot_id) 인덱스(saved_spots_spot_id_idx)가 이미 있어 집계는 인덱스 스캔이다.
--
-- 반환 형태 변경: 기존엔 체크인이 있는 스팟만 행을 냈다(paw_checkins group by).
--     저장만 있고 체크인이 없는 스팟도 행이 나와야 하므로 p_spot_ids를 기준축으로 두고
--     두 집계를 left join한다. 이제 요청한 모든 스팟이 한 행씩 반드시 나온다.

drop function if exists public.spot_list_stats(uuid[], integer);

create function public.spot_list_stats(p_spot_ids uuid[], p_recent_hours integer default 48)
returns table(spot_id uuid, checkin_count integer, recent_tags text[], saved_count integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with ck as (
    select
      c.spot_id,
      count(distinct c.checkin_id) filter (where c.visibility_level <> 'private')::int as checkin_count,
      coalesce(
        array_agg(t.tag::text order by c.checked_in_at desc) filter (
          where c.visibility_level = 'spot_only'
            and c.checked_in_at >= now() - make_interval(hours => p_recent_hours)
            and t.tag is not null
        ),
        '{}'::text[]
      ) as recent_tags
    from public.paw_checkins c
    left join lateral unnest(c.feeling_tags) as t(tag) on true
    where c.spot_id = any(p_spot_ids)
      and c.is_valid_for_aggregate = true
    group by c.spot_id
  ),
  sv as (
    select s.spot_id, count(*)::int as saved_count
    from public.saved_spots s
    where s.spot_id = any(p_spot_ids)
    group by s.spot_id
  )
  select
    ids.id,
    coalesce(ck.checkin_count, 0),
    coalesce(ck.recent_tags, '{}'::text[]),
    coalesce(sv.saved_count, 0)
  from unnest(p_spot_ids) as ids(id)
  left join ck on ck.spot_id = ids.id
  left join sv on sv.spot_id = ids.id;
$function$;

-- ⚠️ Supabase는 함수를 새로 만들 때마다 anon/authenticated에 EXECUTE를 다시 부여한다.
--    엣지 함수(service_role)만 호출하므로 회수한다.
revoke all on function public.spot_list_stats(uuid[], integer) from public, anon, authenticated;
grant execute on function public.spot_list_stats(uuid[], integer) to service_role;

comment on function public.spot_list_stats(uuid[], integer) is
  '목록용 스팟 묶음 집계(누적 발도장 수 + 최근 감정 태그 + 저장 수). 비공개 발도장 제외. 요청한 스팟은 집계가 없어도 0으로 한 행씩 반환.';
