-- 어드민 계정 영구 삭제 (2026-09-01) — super_admin 전용
--
-- 왜 지금까지 없었나: 어드민이 남의 계정을 지울 수 있으면 사고 한 번에 복구가 안 된다.
--   그래서 정지(suspend)·차단(block)만 뒀다. 그 판단은 여전히 유효하다.
--   다만 테스트 계정 정리·법적 삭제요구 이행에는 실제 삭제 경로가 필요하다.
--
-- 안전장치 넷 (모두 실측 검증함):
--   ① super_admin만 실행 — 화면(adminRpc minRole)과 DB(is_admin_at_least) 두 곳에서 검사
--   ② 어드민 계정은 삭제 불가 — 유일한 super_admin을 지워 콘솔에 잠기는 사고를 막는다
--   ③ 사유 필수 — 조치 원장에 남는다
--   ④ **원장을 먼저 쓴다** — 대상이 사라진 뒤에는 무엇을 지웠는지 적을 수 없다
--
-- ⚠️ Storage 파일은 지우지 않는다. 그건 delete-account Edge Function의 몫이다.
--    사진이 있는 계정은 사용자 본인의 앱 탈퇴 경로를 우선한다.

create or replace function public.admin_delete_user(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_auth_id uuid;
  v_email   text;
begin
  if not is_admin_at_least('super_admin') then
    raise exception '권한이 없습니다. 계정 영구 삭제는 super_admin만 가능합니다.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '삭제 사유가 필요합니다.';
  end if;

  select u.auth_id into v_auth_id from users u where u.user_id = p_user_id;
  if v_auth_id is null then
    raise exception '대상 계정을 찾을 수 없습니다.';
  end if;

  if exists (select 1 from admins a where a.id = v_auth_id) then
    raise exception '어드민 계정은 삭제할 수 없습니다. 먼저 어드민 권한을 회수하세요.';
  end if;

  select au.email into v_email from auth.users au where au.id = v_auth_id;

  insert into admin_action_logs (actor_admin_id, target_type, target_id, action_type, reason, metadata)
  values (auth.uid(), 'user', p_user_id, 'delete_account', p_reason,
          jsonb_build_object('email', v_email, 'auth_id', v_auth_id));

  -- users/dogs/paw_checkins/checkin_photos가 CASCADE로 함께 삭제된다.
  -- spot_stats는 DELETE 트리거가 없으므로 장소 누적 통계는 유지된다.
  delete from auth.users where id = v_auth_id;
end $$;

revoke execute on function public.admin_delete_user(uuid, text) from public;   -- PUBLIC EXECUTE 함정 회수
grant  execute on function public.admin_delete_user(uuid, text) to authenticated;

comment on function public.admin_delete_user(uuid, text) is
  'super_admin 전용 계정 영구 삭제. 어드민 계정은 거부하며, 조치 원장을 먼저 남긴다. Storage 파일은 정리하지 않는다.';
