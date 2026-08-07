-- 장소 제안 시 서버에 실제 spots 행(status='hidden')을 만들고, 제안과 연결한다.
--
-- 왜:
--   앱은 제안 장소를 로컬에만 `spot_user_<timestamp>` 라는 가짜 id로 만들었다.
--   spots.spot_id는 uuid라 이 값은 조회조차 되지 않아, 제안 직후 발도장을 찍으면
--   paw-checkin 엣지 함수가 항상 404("Spot not found")를 냈다.
--   RLS 정책 spots_insert_authenticated는 이미
--     (created_source='user_suggested' AND status='hidden')
--   조합만 허용하도록 설계돼 있었는데, 앱이 그 경로를 쓰지 않았을 뿐이다.
--
-- 방식:
--   제안 시 spots에 hidden 행을 만들어 진짜 uuid를 확보한다.
--   hidden이라 검토 전까지 남에게는 보이지 않고(UGC 사전 검열 유지),
--   제안자 본인만 상세 조회·발도장이 가능하다.
--   승인 시 status만 'active'로 바꾸면 그 사이 쌓인 발도장·저장이 그대로 보존된다.

alter table public.spot_suggestions
  add column if not exists provisional_spot_id uuid
    references public.spots(spot_id) on delete set null;

comment on column public.spot_suggestions.provisional_spot_id is
  '제안과 동시에 생성된 임시 스팟(spots.status=hidden). 승인 시 이 행을 active로 전환한다.';

create index if not exists idx_spot_suggestions_provisional_spot
  on public.spot_suggestions(provisional_spot_id)
  where provisional_spot_id is not null;

-- 제안자 본인은 자신의 hidden 스팟을 읽을 수 있어야 한다.
-- 기존 spots_read_authenticated는 status='active'만 허용해
-- 본인이 방금 만든 장소의 상세조차 못 여는 상태였다.
drop policy if exists spots_read_own_provisional on public.spots;
create policy spots_read_own_provisional on public.spots
  for select
  to authenticated
  using (
    status = 'hidden'::spot_status
    and created_source = 'user_suggested'::created_source
    and exists (
      select 1
      from public.spot_suggestions s
      join public.users u on u.user_id = s.user_id
      where s.provisional_spot_id = spots.spot_id
        and u.auth_id = auth.uid()
    )
  );
