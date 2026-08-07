-- 제안 검토 RPC가 임시 스팟(provisional_spot_id)을 인지하도록 고친다.
--
-- 왜 필요한가:
--   이제 앱은 제안과 동시에 spots에 hidden 행을 만들고, 제안자는 거기에 발도장을 남긴다.
--   그런데 승인 RPC는 무조건 spots에 새 행을 INSERT하고 있었다.
--   그대로 두면 승인 순간 같은 장소가 둘로 갈라지고, 제안자가 남긴 첫 발도장은
--   버려진 hidden 스팟에 묶여 사라진다.
--
--   승인 = 이미 있는 임시 스팟을 active로 여는 것.
--   반려/병합 = 임시 스팟을 닫는 것.
--
--   구버전 앱이 만든(임시 스팟 없는) 제안도 계속 처리돼야 하므로 INSERT 경로는 남긴다.

create or replace function public.admin_approve_place_suggestion(p_id uuid, p_reason text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_from text; v_sug public.spot_suggestions%rowtype; v_new_spot_id uuid;
begin
  if not public.is_admin_at_least('admin') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_sug from public.spot_suggestions where suggestion_id=p_id for update;
  if v_sug.suggestion_id is null then raise exception 'not found' using errcode='P0002'; end if;
  v_from := v_sug.status;
  if v_from not in ('proposed','submitted','under_review') then
    raise exception 'invalid transition: % -> approved', v_from using errcode='22023';
  end if;
  if v_sug.latitude is null or v_sug.longitude is null then
    raise exception 'lat/lng required to approve' using errcode='22023';
  end if;

  if v_sug.provisional_spot_id is not null then
    update public.spots
       set status          = 'active',
           name            = v_sug.name,
           category        = coalesce(nullif(v_sug.category,'')::public.spot_category, category),
           latitude        = v_sug.latitude,
           longitude       = v_sug.longitude,
           description     = v_sug.description,
           cover_image_url = coalesce(v_sug.cover_image_url, cover_image_url),
           tags            = to_jsonb(coalesce(v_sug.additional_tags, '{}'::text[]))
     where spot_id = v_sug.provisional_spot_id
       and status <> 'active'
    returning spot_id into v_new_spot_id;
  end if;

  if v_new_spot_id is null then
    insert into public.spots (name, category, latitude, longitude, status, created_source, description, cover_image_url, tags)
    values (v_sug.name,
            coalesce(nullif(v_sug.category,'')::public.spot_category, 'park'::public.spot_category),
            v_sug.latitude, v_sug.longitude, 'active', 'user_suggested',
            v_sug.description, v_sug.cover_image_url,
            to_jsonb(coalesce(v_sug.additional_tags, '{}'::text[])))
    returning spot_id into v_new_spot_id;
  end if;

  update public.spot_suggestions set status='approved', approved_spot_id=v_new_spot_id, reviewed_at=now()
    where suggestion_id=p_id;
  perform public.record_admin_action('place_suggestion', p_id, 'approve_place_suggestion', v_from, 'approved', p_reason,
    jsonb_build_object('place_id', v_new_spot_id,
                       'reused_provisional', (v_sug.provisional_spot_id is not null),
                       'has_cover_image', (v_sug.cover_image_url is not null)));
  return v_new_spot_id;
end; $function$;

create or replace function public.admin_reject_place_suggestion(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_from text; v_prov uuid;
begin
  if not public.is_admin_at_least('admin') then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(p_reason,'')='' then raise exception 'reason required' using errcode='22023'; end if;
  select status, provisional_spot_id into v_from, v_prov
    from public.spot_suggestions where suggestion_id=p_id for update;
  if v_from is null then raise exception 'not found' using errcode='P0002'; end if;
  if v_from not in ('proposed','submitted','under_review') then raise exception 'invalid transition: % -> rejected', v_from using errcode='22023'; end if;

  if v_prov is not null then
    update public.spots set status='archived' where spot_id=v_prov and status='hidden';
  end if;

  update public.spot_suggestions set status='rejected', review_note=p_reason, reviewed_at=now() where suggestion_id=p_id;
  perform public.record_admin_action('place_suggestion', p_id, 'reject_place_suggestion', v_from, 'rejected', p_reason,
    jsonb_build_object('archived_provisional_spot_id', v_prov));
end; $function$;

create or replace function public.admin_merge_place_suggestion(p_id uuid, p_target_place_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_from text; v_prov uuid;
begin
  if not public.is_admin_at_least('admin') then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(p_reason,'')='' then raise exception 'reason required' using errcode='22023'; end if;
  if p_target_place_id is null then raise exception 'target_place_id required' using errcode='22023'; end if;
  select status, provisional_spot_id into v_from, v_prov
    from public.spot_suggestions where suggestion_id=p_id for update;
  if v_from is null then raise exception 'not found' using errcode='P0002'; end if;
  if v_from not in ('proposed','submitted','under_review') then raise exception 'invalid transition: % -> merged', v_from using errcode='22023'; end if;
  if not exists (select 1 from public.spots where spot_id=p_target_place_id) then raise exception 'target place not found' using errcode='P0002'; end if;

  if v_prov is not null and v_prov <> p_target_place_id then
    update public.spots
       set status='merged', merged_into_spot_id=p_target_place_id
     where spot_id=v_prov and status='hidden';
  end if;

  update public.spot_suggestions set status='merged', merged_into_spot_id=p_target_place_id, review_note=p_reason, reviewed_at=now()
    where suggestion_id=p_id;
  perform public.record_admin_action('place_suggestion', p_id, 'merge_place_suggestion', v_from, 'merged', p_reason,
    jsonb_build_object('target_place_id', p_target_place_id, 'closed_provisional_spot_id', v_prov));
end; $function$;

-- SECURITY DEFINER 함수는 재생성 시 anon EXECUTE가 다시 붙는다(Supabase 기본 권한).
revoke all on function public.admin_approve_place_suggestion(uuid, text) from public, anon;
revoke all on function public.admin_reject_place_suggestion(uuid, text)  from public, anon;
revoke all on function public.admin_merge_place_suggestion(uuid, uuid, text) from public, anon;
