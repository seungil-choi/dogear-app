-- 제안 장소의 소유자를 spots에 명시한다.
--
-- 왜 필요한가 (실측으로 확인한 결함):
--   직전 설계는 "제안자 본인"을 spot_suggestions를 거쳐 판정했다.
--     spots_read_own_provisional … EXISTS(spot_suggestions s WHERE s.provisional_spot_id = spots.spot_id …)
--   그런데 앱은 spots를 **먼저** 넣고 그 id로 제안 레코드를 만든다.
--   INSERT 시점에는 제안 레코드가 없으니 SELECT 정책이 성립하지 않고,
--   PostgreSQL은 RETURNING 절이 붙은 INSERT에서 새 행을 읽지 못하면 INSERT 자체를 거부한다.
--
--   authenticated 롤로 재현한 결과:
--     INSERT (RETURNING 없음)  → 성공
--     INSERT ... RETURNING     → 실패 [42501] new row violates row-level security policy
--
--   supabase-js의 .insert().select()는 RETURNING을 쓰므로 장소 제안이 100% 실패한다.
--
-- 해결:
--   소유자를 다른 테이블에서 추론하지 말고 행 자체에 적는다.
--   삽입 순간 이미 "내 행"이라 SELECT 정책이 곧바로 성립하고, 순서 의존성이 사라진다.

alter table public.spots
  add column if not exists suggested_by_user_id uuid
    references public.users(user_id) on delete set null;

comment on column public.spots.suggested_by_user_id is
  '이 장소를 제안한 사용자. 검토 대기(hidden) 상태에서 본인만 조회·발도장할 수 있게 하는 근거.';

create index if not exists idx_spots_suggested_by_user
  on public.spots(suggested_by_user_id)
  where suggested_by_user_id is not null;

drop policy if exists spots_insert_authenticated on public.spots;
create policy spots_insert_authenticated on public.spots
  for insert
  to authenticated
  with check (
    created_source = 'user_suggested'::created_source
    and status = 'hidden'::spot_status
    and suggested_by_user_id in (
      select u.user_id from public.users u where u.auth_id = auth.uid()
    )
  );

drop policy if exists spots_read_own_provisional on public.spots;
create policy spots_read_own_provisional on public.spots
  for select
  to authenticated
  using (
    status = 'hidden'::spot_status
    and created_source = 'user_suggested'::created_source
    and suggested_by_user_id in (
      select u.user_id from public.users u where u.auth_id = auth.uid()
    )
  );
