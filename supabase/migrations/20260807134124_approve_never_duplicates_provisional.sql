-- 승인 시 임시 스팟이 있는데도 새 행을 만들어버리는 경로를 막는다.
--
-- 결함:
--   직전 버전은 `update ... where spot_id = provisional and status <> 'active'
--   returning spot_id into v_new_spot_id` 뒤에 `if v_new_spot_id is null then insert ...`를 뒀다.
--   임시 스팟이 이미 active이거나 삭제됐다면 UPDATE가 0행이 되고,
--   그 순간 **같은 장소가 하나 더 만들어진다**. 제안자가 남긴 발도장은 옛 행에 묶인 채로.
--
--   INSERT 폴백은 '임시 스팟이 애초에 없는 구버전 제안'에만 쓰여야 한다.

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
    returning spot_id into v_new_spot_id;

    if v_new_spot_id is null then
      raise exception 'provisional spot % is missing — 수동 확인 필요', v_sug.provisional_spot_id
        using errcode='P0002';
    end if;
  else
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

revoke all on function public.admin_approve_place_suggestion(uuid, text) from public, anon;
