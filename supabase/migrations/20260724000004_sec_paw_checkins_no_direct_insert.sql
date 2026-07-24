-- SEC-04: 발도장 무결성 — 직접 INSERT 차단
--  · 기존 checkins_own(FOR ALL, with_check=null)은 USING(dog 소유권)이 INSERT check로 재사용되어
--    dog_id만 본인이면 spot_id·checked_in_at·is_valid_for_aggregate 등을 클라가 임의 삽입 가능했다.
--  · 발도장 생성은 paw-checkin 엣지펑션(service_role) 단일 경로로만. 엣지는 근접·중복·소유권 검증 후 삽입.
--  · 유저에게는 SELECT/UPDATE/DELETE만 남기고 INSERT 정책은 제거 → 직접 INSERT는 RLS로 거부.
--    (service_role은 RLS 우회하므로 엣지 삽입은 정상)

DROP POLICY IF EXISTS checkins_own ON public.paw_checkins;

CREATE POLICY checkins_own_select ON public.paw_checkins
  FOR SELECT TO public
  USING (dog_id IN (SELECT d.dog_id FROM dogs d JOIN users u ON d.user_id = u.user_id WHERE u.auth_id = auth.uid()));

CREATE POLICY checkins_own_update ON public.paw_checkins
  FOR UPDATE TO public
  USING (dog_id IN (SELECT d.dog_id FROM dogs d JOIN users u ON d.user_id = u.user_id WHERE u.auth_id = auth.uid()))
  WITH CHECK (dog_id IN (SELECT d.dog_id FROM dogs d JOIN users u ON d.user_id = u.user_id WHERE u.auth_id = auth.uid()));

CREATE POLICY checkins_own_delete ON public.paw_checkins
  FOR DELETE TO public
  USING (dog_id IN (SELECT d.dog_id FROM dogs d JOIN users u ON d.user_id = u.user_id WHERE u.auth_id = auth.uid()));
