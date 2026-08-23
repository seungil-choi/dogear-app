-- 사용자 제안 장소를 즉시 공개한다(status='pending', '검토 중' 표시와 함께).
--
-- 바뀌는 정책:
--   기존 = 제안 → hidden → **제안자 본인만** 조회 → 운영자 승인해야 공개 (사전 검열)
--   변경 = 제안 → pending → **모두 조회 가능** + '검토 중' 배지 → 운영자 승인 시 active
--
-- 왜 바꾸나:
--   ① 초기 서비스에 장소가 없으면 앱이 빈 껍데기다.
--   ② 제안자는 올려도 남이 못 보니 두 번은 올리지 않는다.
--   ③ 운영자가 1명이라 승인이 곧 병목이다.
--   ④ 발도장 사진은 이미 사전 검수 없이 공개된다 — 장소만 막는 건 앞뒤가 안 맞았다.
--
-- 남용 대비: 아래 레이트 리밋 트리거가 짝이다. 이 둘은 함께 있어야 한다.

-- ── 1. 제안 시 pending으로 넣을 수 있게 ──────────────────────────
-- hidden도 계속 허용한다 — 구버전 앱이 아직 hidden을 넣는다(스토어 반영까지 시차).
drop policy if exists spots_insert_authenticated on public.spots;
create policy spots_insert_authenticated on public.spots
  for insert
  to authenticated
  with check (
    created_source = 'user_suggested'::created_source
    and status in ('pending'::spot_status, 'hidden'::spot_status)
    and suggested_by_user_id in (
      select u.user_id from public.users u where u.auth_id = auth.uid()
    )
  );

-- ── 2. pending은 누구나 읽는다 ───────────────────────────────────
-- hidden 소유자 정책(spots_read_own_provisional)은 그대로 둔다 — 구버전 앱 호환.
drop policy if exists spots_read_pending on public.spots;
create policy spots_read_pending on public.spots
  for select
  to authenticated
  using (
    status = 'pending'::spot_status
    and created_source = 'user_suggested'::created_source
  );

-- ── 3. 레이트 리밋 ───────────────────────────────────────────────
-- 근접 반복 등록이 남용의 실제 형태다. 하루 총량은 핀을 흩뿌리는 경우의 보조 상한.
-- 서버에서 막아야 한다 — 앱이 spots에 직접 insert하므로 클라이언트 검사는 우회된다.
create or replace function public.enforce_spot_suggestion_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c_radius_m  constant int := 500;  -- 이 반경 안에서
  c_near_max  constant int := 3;    -- 24시간에 이만큼까지
  c_daily_max constant int := 10;   -- 전체 하루 상한
  v_near int;
  v_day  int;
begin
  -- 시드·운영자 생성은 대상이 아니다
  if new.created_source is distinct from 'user_suggested'::created_source then return new; end if;
  if new.suggested_by_user_id is null then return new; end if;

  select count(*) into v_day
    from public.spots s
   where s.suggested_by_user_id = new.suggested_by_user_id
     and s.created_source = 'user_suggested'::created_source
     and s.created_at > now() - interval '24 hours';

  if v_day >= c_daily_max then
    -- 문구는 앱이 정한다(문서 19 §3.2 — 서버 원문을 그대로 띄우지 않는다).
    -- 여기서는 앱이 분기할 수 있는 안정된 키만 던진다.
    raise exception 'spot_suggest_rate_limit_daily' using errcode = 'P0001';
  end if;

  select count(*) into v_near
    from public.spots s
   where s.suggested_by_user_id = new.suggested_by_user_id
     and s.created_source = 'user_suggested'::created_source
     and s.created_at > now() - interval '24 hours'
     and s.location is not null
     and st_dwithin(
           s.location::geography,
           st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography,
           c_radius_m);

  if v_near >= c_near_max then
    raise exception 'spot_suggest_rate_limit_nearby' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_spot_suggestion_rate_limit() from public, anon, authenticated;

drop trigger if exists spots_enforce_suggestion_rate_limit on public.spots;
create trigger spots_enforce_suggestion_rate_limit
  before insert on public.spots
  for each row execute function public.enforce_spot_suggestion_rate_limit();

-- ── 4. 운영자 RPC가 pending 임시 스팟을 인지하게 ──────────────────
-- 반려·병합이 `status='hidden'`만 보고 있어서, pending 스팟은 조용히 그대로 남았다.
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
    update public.spots set status='archived'
     where spot_id=v_prov and status in ('hidden'::spot_status, 'pending'::spot_status);
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
     where spot_id=v_prov and status in ('hidden'::spot_status, 'pending'::spot_status);
  end if;

  update public.spot_suggestions set status='merged', merged_into_spot_id=p_target_place_id, review_note=p_reason, reviewed_at=now()
    where suggestion_id=p_id;
  perform public.record_admin_action('place_suggestion', p_id, 'merge_place_suggestion', v_from, 'merged', p_reason,
    jsonb_build_object('target_place_id', p_target_place_id, 'closed_provisional_spot_id', v_prov));
end; $function$;

-- SECURITY DEFINER 재생성 시 anon EXECUTE가 다시 붙는다(Supabase 기본). 즉시 회수한다.
revoke all on function public.admin_reject_place_suggestion(uuid, text) from public, anon;
revoke all on function public.admin_merge_place_suggestion(uuid, uuid, text) from public, anon;
grant execute on function public.admin_reject_place_suggestion(uuid, text) to authenticated;
grant execute on function public.admin_merge_place_suggestion(uuid, uuid, text) to authenticated;
