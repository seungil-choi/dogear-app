-- 내부 전용 SECURITY DEFINER 함수 5개에서 클라이언트(anon·authenticated) 실행 권한을 회수한다.
--
-- 발견 (2026-09-15, 출시 전 최종 QA · Supabase 보안 점검 anon_security_definer_function_executable):
--   아래 함수는 권한 검사가 없는데 anon·authenticated에 EXECUTE가 명시적으로 부여돼 있었다.
--   앱 번들에 든 공개 키만으로 /rest/v1/rpc/<함수>를 호출할 수 있었다.
--
--   spot_stats_apply            아무 장소의 발도장·방문 통계를 임의 증감 → 앱에 보이는 숫자 조작   🔴
--   mark_deletion_result        콘텐츠 삭제 작업을 안 지웠는데 완료로 기록                          🟠
--   notify_moderation_action    제재 알림 반복 발송
--   cleanup_orphan_visit_data   정리 작업 임의 실행
--   release_expired_suspensions 만료 정지 해제 임의 실행
--
-- 실제 호출 경로(회수해도 깨지지 않음을 확인):
--   spot_stats_apply            ← trg_spot_stats (SECURITY DEFINER, owner postgres)
--   notify_moderation_action    ← admin_resolve_gallery_photo_report · admin_set_account_sanction (SECURITY DEFINER, postgres)
--   release_expired_suspensions ← cron 'release-expired-suspensions' (postgres)
--   mark_deletion_result        ← Edge Function run-content-deletions (service_role)
--   cleanup_orphan_visit_data   ← Edge Function delete-checkin-photo (service_role)
--
-- ⚠️ PUBLIC에서도 회수한다 — 함수 기본 EXECUTE는 PUBLIC에 붙는다(보안감사 조치 때 겪은 함정).
--    service_role 권한은 명시적으로 유지한다.

revoke execute on function public.spot_stats_apply(uuid, text[], timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.mark_deletion_result(uuid, boolean, text)             from public, anon, authenticated;
revoke execute on function public.notify_moderation_action(uuid)                         from public, anon, authenticated;
revoke execute on function public.cleanup_orphan_visit_data()                            from public, anon, authenticated;
revoke execute on function public.release_expired_suspensions()                          from public, anon, authenticated;

grant execute on function public.spot_stats_apply(uuid, text[], timestamptz, integer) to service_role;
grant execute on function public.mark_deletion_result(uuid, boolean, text)             to service_role;
grant execute on function public.notify_moderation_action(uuid)                         to service_role;
grant execute on function public.cleanup_orphan_visit_data()                            to service_role;
grant execute on function public.release_expired_suspensions()                          to service_role;

-- ── 추가(같은 날 2차 점검) — 콘텐츠 삭제 배치 전용 4개: authenticated 실행 권한 회수 ──
-- anon 권한은 이미 없었으나, 로그인 사용자는 누구나 호출할 수 있었다.
--   list_due_content_deletions  신고 처리 중 콘텐츠 목록·사진 저장 경로 노출
--   list_due_quarantine_purges  격리 원본 저장 경로 노출
--   mark_quarantine_purged      파기하지 않은 격리 원본을 파기 완료로 표시
--   finalize_content_deletion   제재 콘텐츠 삭제 확정을 임의 실행
-- 호출 경로: Edge Function run-content-deletions (service_role) 뿐. DB 내부·cron 호출 없음.
revoke execute on function public.finalize_content_deletion(uuid)      from public, anon, authenticated;
revoke execute on function public.list_due_content_deletions(integer)  from public, anon, authenticated;
revoke execute on function public.list_due_quarantine_purges(integer)  from public, anon, authenticated;
revoke execute on function public.mark_quarantine_purged(uuid)         from public, anon, authenticated;
grant execute on function public.finalize_content_deletion(uuid)      to service_role;
grant execute on function public.list_due_content_deletions(integer)  to service_role;
grant execute on function public.list_due_quarantine_purges(integer)  to service_role;
grant execute on function public.mark_quarantine_purged(uuid)         to service_role;
