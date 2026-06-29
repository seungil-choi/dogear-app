-- 프라이버시 강화: familiar_dog_signals 직접 조회 차단 (스토킹 리스크 완화)
-- 적용: 2026-06-29 (apply_migration).
-- 기존 정책(familiar_read_authenticated)은 로그인한 누구나 exposure_allowed=true 행의
-- 정확한 recent_last_seen_at(시각)·recent_visible_checkin_count·spot_id·visible_dog_id를
-- 직접 읽게 허용 → UI의 시간 완화(softenedRecencyLabel)가 무의미했음.
-- familiar 데이터는 spot-detail/familiar-dogs Edge Function(service_role, RLS 우회)이
-- 6조건 검증 + 완화해 제공하므로 클라이언트 직접 조회는 불필요.
drop policy if exists familiar_read_authenticated on public.familiar_dog_signals;

-- 관리자만 직접 조회 (운영 점검용). 일반 사용자는 Edge Function 경유만.
drop policy if exists familiar_admin_select on public.familiar_dog_signals;
create policy familiar_admin_select on public.familiar_dog_signals
  for select to authenticated using (public.is_admin());
