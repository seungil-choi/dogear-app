-- 모더레이션 큐 확장: 발도장(체크인) 사진 검수 (2026-07-01 apply_migration로 라이브 적용)
-- 배경: 발도장 사진 업로드 배선(클라 → checkin-photos 버킷 → paw-checkin photoUrl)에 맞춰
--       체크인 사진도 사후 검수 대상에 포함. 숨김 시 paw_checkins.photo_url 제거.
alter table public.media_moderation_queue
  drop constraint if exists media_moderation_queue_content_type_check;
alter table public.media_moderation_queue
  add constraint media_moderation_queue_content_type_check
  check (content_type in ('dog_avatar','checkin_photo'));
alter table public.media_moderation_queue
  add column if not exists checkin_id uuid references public.paw_checkins(checkin_id) on delete cascade;

create or replace function public.admin_review_avatar(p_id uuid, p_decision text, p_reason text default null)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_from text; v_dog uuid; v_old_url text; v_type text; v_checkin uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_decision not in ('approved','hidden') then
    raise exception 'decision must be approved or hidden' using errcode='22023';
  end if;

  select status, dog_id, image_url, content_type, checkin_id
    into v_from, v_dog, v_old_url, v_type, v_checkin
    from public.media_moderation_queue where id = p_id for update;
  if v_from is null then raise exception 'not found' using errcode='P0002'; end if;
  if v_from <> 'pending' then
    raise exception 'invalid transition: % -> %', v_from, p_decision using errcode='22023';
  end if;

  if p_decision = 'hidden' then
    if v_type = 'dog_avatar' and v_dog is not null then
      update public.dogs set avatar_url = null where dog_id = v_dog and avatar_url = v_old_url;
      perform public.record_admin_action('dog_avatar', v_dog, 'hide_avatar', null, 'hidden',
        coalesce(p_reason,'부적절 이미지'), jsonb_build_object('queue_id', p_id, 'image_url', v_old_url));
    elsif v_type = 'checkin_photo' and v_checkin is not null then
      update public.paw_checkins set photo_url = null where checkin_id = v_checkin and photo_url = v_old_url;
      perform public.record_admin_action('paw_checkin', v_checkin, 'hide_checkin_photo', null, 'hidden',
        coalesce(p_reason,'부적절 이미지'), jsonb_build_object('queue_id', p_id, 'image_url', v_old_url));
    end if;
  end if;

  update public.media_moderation_queue
    set status = p_decision, reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_id;

  perform public.record_admin_action('media_moderation', p_id, 'review_avatar', v_from, p_decision,
    p_reason, jsonb_build_object('dog_id', v_dog, 'checkin_id', v_checkin, 'content_type', v_type));
end; $function$;
