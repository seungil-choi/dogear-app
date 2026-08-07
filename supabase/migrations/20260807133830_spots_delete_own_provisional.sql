-- 제안 도중 실패했을 때 자기가 만든 임시 장소를 되돌릴 수 있게 한다.
--
-- 왜:
--   앱은 spots(hidden) → spot_suggestions 순서로 넣는다. 두 번째가 실패하면
--   검토 큐에 잡히지 않는 유령 장소가 남는다. 롤백 delete를 넣었는데
--   spots에는 사용자 DELETE 정책이 아예 없어 **조용히 0건 삭제**되고 있었다.
--
-- 안전장치:
--   · 본인이 만든 것, 검토 대기(hidden), 사용자 제안 출처만.
--   · paw_checkins.spot_id FK가 NO ACTION이라 발도장이 하나라도 있으면
--     삭제가 FK 위반으로 막힌다 → 기록이 유실될 경로가 없다.

drop policy if exists spots_delete_own_provisional on public.spots;
create policy spots_delete_own_provisional on public.spots
  for delete
  to authenticated
  using (
    status = 'hidden'::spot_status
    and created_source = 'user_suggested'::created_source
    and suggested_by_user_id in (
      select u.user_id from public.users u where u.auth_id = auth.uid()
    )
  );
