-- 어드민 역할(role) 실집행 (Admin Adversarial Audit A-2)
--
-- 배경:
--   admins.role은 reviewer/admin/super_admin 3단계로 설계돼 있으나,
--   파괴적 RPC가 전부 is_admin()(= active admin이면 통과)만 검사해
--   reviewer가 사용자 익명화·차단, 장소 병합·삭제까지 수행할 수 있었다.
--   앱(requireAdmin 등급 미지정)과 DB 양쪽이 같은 결함이라 다층 방어가 성립하지 않았다.
--
-- 정책:
--   reviewer    — 읽기 + '검토함' 표시(비파괴 분류)까지
--   admin       — 콘텐츠 조치(신고 처리, 제안 승인/반려, 장소 숨김/차단/병합/수정, 사용자 상태변경)
--   super_admin — 사용자 익명화(비가역 PII 처리), 관리자 관리
--
-- 방법:
--   대상 함수의 가드 `public.is_admin()`(각 함수에 정확히 1회 존재함을 사전 확인)만
--   등급 검사로 치환한다. CREATE OR REPLACE라 기존 권한(GRANT)은 보존된다.

-- 1) 등급 비교 헬퍼
create or replace function public.is_admin_at_least(p_min text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.admins
    where id = auth.uid()
      and status = 'active'
      and (case role
             when 'super_admin' then 3
             when 'admin'       then 2
             when 'reviewer'    then 1
             else 0 end)
          >=
          (case p_min
             when 'super_admin' then 3
             when 'admin'       then 2
             when 'reviewer'    then 1
             else 0 end)
  );
$function$;

-- 기본 PUBLIC EXECUTE 회수 (익명 호출 차단)
revoke execute on function public.is_admin_at_least(text) from public;
grant  execute on function public.is_admin_at_least(text) to authenticated, service_role;

-- 2) 콘텐츠 조치 함수 → admin 이상
do $mig$
declare
  r record;
begin
  for r in
    select oid from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = any(array[
        'admin_set_user_status',
        'admin_hide_place', 'admin_restore_place', 'admin_block_place',
        'admin_merge_place', 'admin_update_place',
        'admin_resolve_place_report', 'admin_reject_place_report', 'admin_resolve_photo_report',
        'admin_approve_place_suggestion', 'admin_reject_place_suggestion', 'admin_merge_place_suggestion',
        'admin_merge_duplicate_candidate', 'admin_dismiss_duplicate_candidate',
        'admin_review_avatar'
      ])
  loop
    execute replace(
      pg_get_functiondef(r.oid),
      'public.is_admin()',
      'public.is_admin_at_least(''admin'')'
    );
  end loop;
end $mig$;

-- 3) 비가역 PII 처리 → super_admin 전용
do $mig$
declare
  r record;
begin
  for r in
    select oid from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'admin_anonymize_user'
  loop
    execute replace(
      pg_get_functiondef(r.oid),
      'public.is_admin()',
      'public.is_admin_at_least(''super_admin'')'
    );
  end loop;
end $mig$;

-- 참고: admin_review_* (검토함 표시)와 조회·대시보드 함수는 is_admin() 유지 = reviewer 통과.
--       admin_review_photo_report / admin_reject_photo_report는 각각
--       admin_review_report / admin_reject_place_report로 위임하는 래퍼라 상위 가드를 그대로 상속한다.
