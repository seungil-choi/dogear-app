-- 보안 감사 §8.1 후속 — 함수 기본 PUBLIC EXECUTE 회수
--  · Postgres는 함수 생성 시 PUBLIC에 EXECUTE를 기본 부여한다. anon만 직접 REVOKE해도 PUBLIC 경유로 실행되므로
--    반드시 FROM PUBLIC 회수 후 필요한 역할(authenticated/service_role)만 명시 GRANT해야 실제로 차단된다.

-- get_spots_nearby: 익명 차단, 엣지펑션(유저 JWT=authenticated)만 허용
REVOKE EXECUTE ON FUNCTION public.get_spots_nearby(double precision, double precision, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_spots_nearby(double precision, double precision, integer, integer) TO authenticated, service_role;

-- get_regular_spots: 익명 차단, 클라(authenticated)만 허용 (소유권 검사는 20260724000002에서 추가됨)
REVOKE EXECUTE ON FUNCTION public.get_regular_spots(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_regular_spots(uuid) TO authenticated, service_role;

-- search_spots: 호출자 없음 → 전면 차단 (service_role만)
REVOKE EXECUTE ON FUNCTION public.search_spots(text, spot_category, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_spots(text, spot_category, integer) TO service_role;

-- send_weekly_summaries: cron/service_role 전용 (PUBLIC 재확인)
REVOKE EXECUTE ON FUNCTION public.send_weekly_summaries() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_weekly_summaries() TO service_role;
