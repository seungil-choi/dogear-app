-- 자체 법무 검토(2026-08-23) 조치. 문서와 구현이 어긋난 곳을 맞췄다.

-- ① 🔴 appeals 본인 조회 정책이 항상 참이었다 — 남의 이의제기를 아무나 읽을 수 있었다.
--    기존: EXISTS (... WHERE u.user_id = u.user_id AND u.auth_id = auth.uid())
--                            ^^^^^^^^^^^^^^^^^^^^^ 자기 자신과 비교 = 항상 참
--    이의제기 본문에는 제재 사유에 대한 본인 진술이 담긴다. 실측으로 재현했다.
drop policy if exists "own appeals" on public.appeals;
create policy "own appeals" on public.appeals
  for select
  using (
    exists (
      select 1 from public.users u
      where u.user_id = appeals.user_id
        and u.auth_id = auth.uid()
    )
  );

-- ② 탈퇴 시 조치·이의 기록이 CASCADE로 통째 삭제되던 것을 SET NULL로.
--    처리방침 §3③이 "사건 종결 후 1년간 보관"을 약속하는데 지킬 수 없는 상태였다.
--    기록은 남기고 개인 식별자만 끊는다(§3③ "개인 식별정보는 최소화하여 분리 보관").
alter table public.moderation_actions alter column subject_user_id drop not null;
alter table public.moderation_actions drop constraint moderation_actions_subject_user_id_fkey;
alter table public.moderation_actions
  add constraint moderation_actions_subject_user_id_fkey
  foreign key (subject_user_id) references public.users(user_id) on delete set null;

alter table public.appeals alter column user_id drop not null;
alter table public.appeals drop constraint appeals_user_id_fkey;
alter table public.appeals
  add constraint appeals_user_id_fkey
  foreign key (user_id) references public.users(user_id) on delete set null;

-- ③ 위치정보 취급대장 6개월 파기 (위치정보법 §16② ↔ PIPA 최소보관)
create or replace function public.purge_old_location_access_logs()
returns void language sql security definer
set search_path to 'public', 'pg_temp'
as $$ delete from public.location_access_logs where created_at < now() - interval '6 months'; $$;
revoke all on function public.purge_old_location_access_logs() from public, anon, authenticated;
-- cron: '45 4 * * *' purge-location-access-logs

-- ④ 광고 수신 동의 2년 재확인 (정보통신망법 시행령 §62-3)
--    처리방침 §3⑥이 약속하는데 구현이 없었다. 안내 자체는 광고가 아니라 법정 고지라
--    수신 동의와 무관하게 앱 알림함으로 보낼 수 있다.
--    (본문은 DB의 함수 정의 참조 — 전송자·동의일·철회 방법을 담는다)
-- cron: '0 5 * * *' confirm-marketing-consents
