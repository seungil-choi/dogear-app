-- 🔴 회귀 수정: 발도장 저장이 전부 실패하고 있었다 (2026-09-01 오후 ~ 09-02 20시)
--
-- 증상: 앱에서 "발도장을 저장하지 못했어요". 근접 검증은 통과("장소 근처에 있어요")인데
--   저장 단계에서 500.
--
-- 원인: paw_checkins.feeling_tags의 타입은 text[]가 아니라 **feeling_tag[] (enum 배열)** 이다.
--   20260901120000 마이그레이션에서 spot_stats_apply를 text[]로 선언해 시그니처가 어긋났다.
--     ERROR 42883: function spot_stats_apply(uuid, feeling_tag[], timestamptz, integer) does not exist
--   트리거가 AFTER INSERT라 예외가 **INSERT 자체를 롤백**시켰다 → 발도장 100% 실패.
--
-- ⚠️ 왜 못 잡았나 (같은 실수 반복 금지):
--   도입 당시 검증을 **백필 결과(누적 4)로만** 했다. 백필은 SQL에서 unnest()를 직접 써
--   이 함수를 타지 않는다. 즉 **INSERT 경로는 한 번도 실행해보지 않았다.**
--   트리거를 만들면 반드시 실제 INSERT를 한 번 돌려보고 델타를 확인할 것.

create or replace function trg_spot_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if spot_stats_counts(new) then
      -- ::text[] 캐스팅이 핵심 — enum 배열을 함수 시그니처에 맞춘다.
      perform spot_stats_apply(new.spot_id, new.feeling_tags::text[], new.checked_in_at, 1);
    end if;
  elsif TG_OP = 'UPDATE' then
    if spot_stats_counts(old) and not spot_stats_counts(new) then
      perform spot_stats_apply(old.spot_id, old.feeling_tags::text[], old.checked_in_at, -1);
    elsif not spot_stats_counts(old) and spot_stats_counts(new) then
      perform spot_stats_apply(new.spot_id, new.feeling_tags::text[], new.checked_in_at, 1);
    end if;
  end if;
  return null;
end $$;
revoke execute on function trg_spot_stats() from public;
