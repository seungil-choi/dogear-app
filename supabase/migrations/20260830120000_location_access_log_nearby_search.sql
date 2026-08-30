-- 위치정보 이용사실 확인자료(취급대장)에 '주변 장소 탐색'을 추가한다.
--
-- 왜: 관리지침 §4.1이 취급대장 목적을 "장소 탐색 / 근접 검증" 둘로 이미 정해뒀는데
--     구현은 발도장(proximity_checkin)만 기록하고 있었다. 문서와 구현이 어긋난 상태로
--     신고하면 나중에 점검에서 "탐색 로그가 없다"가 된다.
--     위치정보법 §16의 이용사실 확인자료는 과소 기록이 위반 리스크다.
--
-- 좌표는 여기서도 남기지 않는다 — 누가·언제·무슨 목적뿐이다.
--
-- ⚠️ 지도를 움직일 때마다 spots-nearby가 불린다. 그대로 1:1로 남기면 로그가 폭증하고,
--    그건 "최소 처리" 원칙에도 어긋난다. 같은 사용자·같은 목적은 10분에 1건으로 접는다.
--    (법이 요구하는 건 "이용했다는 사실"이지 호출 횟수가 아니다.)

CREATE OR REPLACE FUNCTION public.log_location_access(p_purpose text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN;   -- 비로그인 탐색은 개인위치정보 주체를 특정할 수 없다
  END IF;

  BEGIN
    INSERT INTO public.location_access_logs (user_id, purpose)
    SELECT v_user, p_purpose
    WHERE NOT EXISTS (
      SELECT 1 FROM public.location_access_logs l
      WHERE l.user_id = v_user
        AND l.purpose = p_purpose
        AND l.created_at > now() - interval '10 minutes'
    );
  EXCEPTION WHEN OTHERS THEN
    -- best-effort. 대장 기록 실패가 장소 조회를 막으면 안 된다.
    RAISE WARNING 'log_location_access failed: %', SQLERRM;
  END;
END;
$$;

-- ⚠️ Postgres 함수는 기본적으로 PUBLIC에 EXECUTE가 열린다. 반드시 회수한 뒤 부여한다.
REVOKE ALL ON FUNCTION public.log_location_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_location_access(text) TO authenticated;

-- 중복 제거 조회(사용자·목적·최근 10분)가 매 호출 돈다. 인덱스가 없으면 풀스캔이다.
CREATE INDEX IF NOT EXISTS location_access_logs_user_purpose_time_idx
  ON public.location_access_logs (user_id, purpose, created_at DESC);
