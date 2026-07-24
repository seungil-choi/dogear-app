-- SEC-08/09: 차단 양방향화 — 스토킹 방어
--  · 기존 필터는 "내가 차단한 대상"만 숨겨(단방향), 차단당한 스토커는 피해자의 강아지·흔적·알림을 계속 봄.
--  · 이 함수는 호출자(auth.uid())와 '어느 방향으로든' 차단관계인 상대 유저 집합을 반환한다.
--    유저 단위 차단 + 강아지 단위 차단(→주인으로 해석)을 모두 포함. 양방향(내가↔상대) 대칭.
--  · familiar-dogs / spot-detail / notify-familiar 엣지펑션이 유저 컨텍스트로 호출해 소유주 단위로 제외.

CREATE OR REPLACE FUNCTION public.blocked_counterpart_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH me AS (SELECT u.user_id AS uid FROM users u WHERE u.auth_id = auth.uid())
  -- 내가 직접 차단한 유저
  SELECT b.blocked_user_id AS user_id FROM blocks b, me
    WHERE b.blocker_user_id = me.uid AND b.blocked_user_id IS NOT NULL
  UNION
  -- 내가 차단한 강아지의 주인
  SELECT d.user_id FROM blocks b JOIN dogs d ON d.dog_id = b.blocked_dog_id, me
    WHERE b.blocker_user_id = me.uid AND b.blocked_dog_id IS NOT NULL
  UNION
  -- 나를 직접 차단한 유저
  SELECT b.blocker_user_id FROM blocks b, me
    WHERE b.blocked_user_id = me.uid
  UNION
  -- 내 강아지를 차단한 유저
  SELECT b.blocker_user_id FROM blocks b JOIN dogs d ON d.dog_id = b.blocked_dog_id, me
    WHERE d.user_id = me.uid;
$function$;

-- PUBLIC 기본 EXECUTE 회수 후 필요한 역할만 (엣지=유저 컨텍스트 rpc + service_role)
REVOKE EXECUTE ON FUNCTION public.blocked_counterpart_user_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.blocked_counterpart_user_ids() TO authenticated, service_role;
