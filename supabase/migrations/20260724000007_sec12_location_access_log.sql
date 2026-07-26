-- SEC-12: 위치정보 이용·제공 사실 확인자료(취급대장) — 위치정보법 제16조
--  · 위치정보를 이용한 사실을 자동 기록하고 최소 6개월 보존해야 함(약관 제6조에서 약속).
--  · 최소 필드만: 누구(user_id)·언제(created_at)·목적(purpose). 실제 좌표는 저장하지 않음(추가 위치데이터 방지).
--  · 발도장 = 근접검증에 사용자 위치를 이용하는 discrete 이벤트 → 이를 취급대장 기록 대상으로 한다.
--  · ⚠️ 법정 보존 기록이라 계정 삭제 후에도 잔존(FK 없음). 지도 탐색(고빈도)은 볼륨상 미기록 — 정책은 법무 검토 대상.

CREATE TABLE IF NOT EXISTS public.location_access_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid,          -- 앱 users.user_id. FK 없음: 법정 보존 위해 계정삭제 후에도 잔존.
  purpose    text not null, -- 예: 'proximity_checkin'
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS location_access_logs_created_idx ON public.location_access_logs (created_at desc);
CREATE INDEX IF NOT EXISTS location_access_logs_user_idx    ON public.location_access_logs (user_id);

ALTER TABLE public.location_access_logs ENABLE ROW LEVEL SECURITY;
-- 관리자만 조회. 삽입은 service_role(RLS 우회) 또는 아래 SECURITY DEFINER 트리거만 — 클라 insert 정책 없음.
DROP POLICY IF EXISTS location_access_logs_admin_select ON public.location_access_logs;
CREATE POLICY location_access_logs_admin_select ON public.location_access_logs
  FOR SELECT TO authenticated USING (is_admin());

-- 발도장(근접검증=위치정보 이용) 시 자동 기록. best-effort: 로그 실패가 발도장을 막지 않도록.
CREATE OR REPLACE FUNCTION public.log_location_access_on_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.location_access_logs (user_id, purpose)
    SELECT d.user_id, 'proximity_checkin' FROM public.dogs d WHERE d.dog_id = NEW.dog_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'location_access_log insert failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_location_access_checkin ON public.paw_checkins;
CREATE TRIGGER trg_log_location_access_checkin
  AFTER INSERT ON public.paw_checkins
  FOR EACH ROW EXECUTE FUNCTION public.log_location_access_on_checkin();
