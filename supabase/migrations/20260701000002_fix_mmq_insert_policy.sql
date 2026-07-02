-- 버그 수정 (2026-07-01 라이브 적용): mmq_insert_own이 d.user_id = auth.uid()로 비교했으나
-- dogs.user_id는 앱 user_id(≠ auth.uid())라 실사용자의 모더레이션 큐 적재(아바타/체크인 사진)가
-- 항상 RLS에 조용히 차단되던 문제. users.auth_id 조인으로 교정.
-- 검증: 실사용자 auth 컨텍스트 시뮬레이션으로 INSERT 성공 확인(롤백).
drop policy if exists mmq_insert_own on public.media_moderation_queue;
create policy mmq_insert_own on public.media_moderation_queue
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dogs d
      join public.users u on u.user_id = d.user_id
      where d.dog_id = media_moderation_queue.dog_id
        and u.auth_id = auth.uid()
    )
  );
