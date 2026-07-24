-- 보안 감사(31.Adversarial Security Audit) §8.1 즉시 조치 — SECDEF/IDOR
--  · 앱 호출 경로 보존: 엣지펑션/클라는 authenticated(유저 JWT)로 호출하므로 authenticated는 유지, anon만 차단.

-- SEC-01: send_weekly_summaries 익명/유저 실행 회수 → 푸시 폭탄·DoS 차단 (cron/service_role 전용)
REVOKE EXECUTE ON FUNCTION public.send_weekly_summaries() FROM anon, authenticated, public;

-- SEC-03: 익명 스크래핑 차단
--  · get_spots_nearby: spots-nearby 엣지펑션이 유저 JWT(authenticated)로 호출 → authenticated 유지, anon 회수
REVOKE EXECUTE ON FUNCTION public.get_spots_nearby(double precision, double precision, integer, integer) FROM anon;
--  · search_spots: 호출자 없음(코드 grep 0건) → anon·authenticated 모두 회수
REVOKE EXECUTE ON FUNCTION public.search_spots(text, spot_category, integer) FROM anon, authenticated;

-- SEC-02: get_regular_spots IDOR 차단 — 소유권 검사 추가 + anon 회수 (subcategory 반환 유지)
--  · SECURITY DEFINER라 spot_visit_summaries의 소유자 RLS를 우회하므로, 함수 내부에서 auth.uid() 소유권을 강제.
DROP FUNCTION IF EXISTS public.get_regular_spots(uuid);
CREATE FUNCTION public.get_regular_spots(p_dog_id uuid)
 RETURNS TABLE(spot_id uuid, name text, category spot_category, subcategory text,
   latitude double precision, longitude double precision, neighborhood text,
   visit_count integer, last_visit_at timestamp with time zone, regular_status regular_status)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT sp.spot_id, sp.name, sp.category, sp.subcategory, sp.latitude, sp.longitude, sp.neighborhood,
    svs.visit_count, svs.last_visit_at, svs.regular_status
  FROM spot_visit_summaries svs
  JOIN spots sp ON svs.spot_id = sp.spot_id
  WHERE svs.dog_id = p_dog_id
    AND svs.dog_id IN (
      SELECT d.dog_id FROM dogs d JOIN users u ON d.user_id = u.user_id
      WHERE u.auth_id = auth.uid()
    )
    AND svs.regular_status IN ('candidate','regular') AND sp.status = 'active'
  ORDER BY CASE svs.regular_status WHEN 'regular' THEN 0 ELSE 1 END, svs.last_visit_at DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_regular_spots(uuid) TO authenticated, service_role;

-- SEC-25: auth_login_logs 감사로그 위조 방지 — 익명/유저 INSERT 정책 제거 (service_role만; RLS 우회)
--  · 코드상 클라·엣지 어디서도 insert하지 않음(미사용) → 제거해도 기능 영향 없음.
DROP POLICY IF EXISTS auth_login_logs_insert ON public.auth_login_logs;
