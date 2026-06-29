-- UGC 이미지(강아지 아바타) 사후 모더레이션 큐 (Apple Guideline 1.2, 무료 관리자 검수)
-- 적용: 2026-06-29 (apply_migration). 아바타 업로드 시 클라이언트가 pending으로 적재 →
--       관리자가 admin/moderation에서 승인/숨김. 숨김 시 dogs.avatar_url 제거.
create table if not exists public.media_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  content_type text not null default 'dog_avatar' check (content_type in ('dog_avatar')),
  dog_id uuid references public.dogs(dog_id) on delete cascade,
  image_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index if not exists media_moderation_queue_status_idx
  on public.media_moderation_queue (status, created_at desc);

alter table public.media_moderation_queue enable row level security;

-- 본인 강아지의 아바타만 큐에 적재 가능
drop policy if exists mmq_insert_own on public.media_moderation_queue;
create policy mmq_insert_own on public.media_moderation_queue
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dogs d
      where d.dog_id = media_moderation_queue.dog_id
        and d.user_id = auth.uid()
    )
  );

-- 관리자만 조회
drop policy if exists mmq_admin_select on public.media_moderation_queue;
create policy mmq_admin_select on public.media_moderation_queue
  for select to authenticated using (public.is_admin());

-- 관리자 검수 RPC: approve(승인) / hide(숨김 → dogs.avatar_url 제거)
create or replace function public.admin_review_avatar(p_id uuid, p_decision text, p_reason text default null)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_from text; v_dog uuid; v_old_avatar text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_decision not in ('approved','hidden') then
    raise exception 'decision must be approved or hidden' using errcode='22023';
  end if;

  select status, dog_id, image_url into v_from, v_dog, v_old_avatar
    from public.media_moderation_queue where id = p_id for update;
  if v_from is null then raise exception 'not found' using errcode='P0002'; end if;
  if v_from <> 'pending' then
    raise exception 'invalid transition: % -> %', v_from, p_decision using errcode='22023';
  end if;

  if p_decision = 'hidden' then
    update public.dogs set avatar_url = null where dog_id = v_dog and avatar_url = v_old_avatar;
    perform public.record_admin_action('dog_avatar', v_dog, 'hide_avatar', null, 'hidden',
      coalesce(p_reason,'부적절 이미지'), jsonb_build_object('queue_id', p_id, 'image_url', v_old_avatar));
  end if;

  update public.media_moderation_queue
    set status = p_decision, reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_id;

  perform public.record_admin_action('media_moderation', p_id, 'review_avatar', v_from, p_decision,
    p_reason, jsonb_build_object('dog_id', v_dog));
end; $function$;

grant execute on function public.admin_review_avatar(uuid, text, text) to authenticated;
