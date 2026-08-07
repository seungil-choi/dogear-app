-- SECURITY DEFINER 함수 권한 재조임
--
-- 함정: Supabase는 ALTER DEFAULT PRIVILEGES로 새로 만든 함수에 anon·authenticated EXECUTE를
--       자동으로 붙인다. 그래서 `revoke ... from public` 만으로는 부족하고,
--       anon/authenticated를 명시적으로 회수해야 실제로 좁혀진다.
--       (직전 마이그레이션에서 get_spots_nearby가 anon에게 열린 채로 재생성됐다 — SEC-03 회귀)

revoke all on function public.get_spots_nearby(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_spots_nearby(double precision, double precision, integer, integer)
  to service_role;

revoke all on function public.spot_public_stats(uuid) from public, anon, authenticated;
grant execute on function public.spot_public_stats(uuid) to service_role;
