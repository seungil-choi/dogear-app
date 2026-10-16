-- 공지사항 (planning/37) — 마이페이지 게시판 + 알림함 연결 + 어드민 관리
--
-- 왜: 약관 §3②·처리방침 §16이 "앱 내 공지"를 약속하는데 공지를 띄울 곳이 없었다.
--     약관 개정 고지(시행 7일·30일 전)의 증빙도 여기서 남는다(누가·언제 게시했나 = admin_action_logs).
--
-- 쓰기는 전부 어드민 RPC로만 한다(테이블 직접 쓰기 정책 없음).
-- 알림함 행(notifications)은 게시 시점의 활성 회원에게 한 번만 만든다(inbox_sent_at으로 중복 방지).
-- 푸시는 별도 엣지 함수(notice-push)가 보낸다 — DB 함수에서 외부 호출을 하지 않는다.

create table if not exists public.notices (
  notice_id     uuid primary key default gen_random_uuid(),
  category      text not null default 'service'
                check (category in ('policy', 'service', 'maintenance', 'event')),
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  body          text not null check (char_length(btrim(body)) between 1 and 10000),
  -- 본문 하단 버튼: 앱 안 경로만 허용(예: /terms, /privacy-policy). 외부 링크는 받지 않는다
  link_path     text check (link_path is null or link_path ~ '^/[A-Za-z0-9/_\-]*$'),
  link_label    text check (link_label is null or char_length(link_label) between 1 and 30),
  is_pinned     boolean not null default false,
  status        text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  published_at  timestamptz,
  inbox_sent_at timestamptz,
  inbox_count   integer,
  push_sent_at  timestamptz,
  push_count    integer,
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_notices_published
  on public.notices (is_pinned desc, published_at desc)
  where status = 'published';

alter table public.notices enable row level security;

-- 앱: 게시된 공지만 읽는다(로그인 사용자)
drop policy if exists notices_read_published on public.notices;
create policy notices_read_published on public.notices
  for select to authenticated
  using (status = 'published');

-- 어드민: 임시저장·내린 공지까지 전부 읽는다 (어드민은 anon+세션이라 정책이 없으면 화면이 조용히 빈다)
drop policy if exists notices_admin_read on public.notices;
create policy notices_admin_read on public.notices
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete, truncate on public.notices from anon, authenticated;

-- ── 저장(새로 만들기 + 수정) ──
create or replace function public.admin_save_notice(
  p_notice_id  uuid,
  p_category   text,
  p_title      text,
  p_body       text,
  p_is_pinned  boolean default false,
  p_link_path  text default null,
  p_link_label text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_admin_at_least('admin') then
    raise exception '공지를 작성할 권한이 없습니다' using errcode = '42501';
  end if;
  if (nullif(btrim(p_link_path), '') is null) <> (nullif(btrim(p_link_label), '') is null) then
    raise exception '버튼 경로와 버튼 문구는 함께 입력해야 합니다';
  end if;

  if p_notice_id is null then
    insert into public.notices (category, title, body, is_pinned, link_path, link_label, created_by, updated_by)
    values (p_category, btrim(p_title), p_body, coalesce(p_is_pinned, false),
            nullif(btrim(p_link_path), ''), nullif(btrim(p_link_label), ''), auth.uid(), auth.uid())
    returning notice_id into v_id;
    insert into public.admin_action_logs (actor_admin_id, target_type, target_id, action_type, to_status, metadata)
    values (auth.uid(), 'notice', v_id, 'notice_create', 'draft', jsonb_build_object('title', btrim(p_title)));
  else
    update public.notices
       set category = p_category, title = btrim(p_title), body = p_body,
           is_pinned = coalesce(p_is_pinned, false),
           link_path = nullif(btrim(p_link_path), ''), link_label = nullif(btrim(p_link_label), ''),
           updated_by = auth.uid(), updated_at = now()
     where notice_id = p_notice_id
    returning notice_id into v_id;
    if v_id is null then raise exception '공지를 찾을 수 없습니다'; end if;
    insert into public.admin_action_logs (actor_admin_id, target_type, target_id, action_type, metadata)
    values (auth.uid(), 'notice', v_id, 'notice_update', jsonb_build_object('title', btrim(p_title)));
  end if;
  return v_id;
end $$;

-- ── 게시 ──
-- 알림함 보내기를 켜면, 게시 시점의 활성 회원에게 notifications 행을 하나씩 만든다.
-- 이미 보낸 공지(inbox_sent_at)는 다시 보내지 않는다 — 내렸다 다시 게시해도 알림이 두 번 가지 않는다.
create or replace function public.admin_publish_notice(p_notice_id uuid, p_send_inbox boolean default true)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  n public.notices%rowtype;
  v_count integer := 0;
  v_title text;
begin
  if not public.is_admin_at_least('admin') then
    raise exception '공지를 게시할 권한이 없습니다' using errcode = '42501';
  end if;
  select * into n from public.notices where notice_id = p_notice_id for update;
  if not found then raise exception '공지를 찾을 수 없습니다'; end if;

  update public.notices
     set status = 'published',
         published_at = coalesce(published_at, now()),
         updated_by = auth.uid(), updated_at = now()
   where notice_id = p_notice_id;

  if p_send_inbox and n.inbox_sent_at is null then
    -- 이벤트 공지는 광고다: 알림함에도 (광고) 표기를 붙인다(정보통신망법 §50)
    v_title := case when n.category = 'event' then '(광고) ' || n.title else n.title end;
    insert into public.notifications (user_id, type, title, body, data)
    select u.user_id, 'notice', v_title,
           left(regexp_replace(n.body, '\s+', ' ', 'g'), 120),
           jsonb_build_object('notice_id', n.notice_id, 'category', n.category)
      from public.users u
     where u.status = 'active'
       and (n.category <> 'event' or exists (
             select 1 from public.consents c where c.user_id = u.user_id and c.marketing_push));
    get diagnostics v_count = row_count;
    update public.notices set inbox_sent_at = now(), inbox_count = v_count where notice_id = p_notice_id;
  end if;

  insert into public.admin_action_logs (actor_admin_id, target_type, target_id, action_type, from_status, to_status, metadata)
  values (auth.uid(), 'notice', p_notice_id, 'notice_publish', n.status, 'published',
          jsonb_build_object('title', n.title, 'inbox_count', v_count, 'inbox_already_sent', n.inbox_sent_at is not null));

  return jsonb_build_object('inbox_count', v_count, 'inbox_already_sent', n.inbox_sent_at is not null);
end $$;

-- ── 내리기 ── 삭제하지 않는다. 앱 목록·상세에서 사라지고 기록은 남는다
create or replace function public.admin_hide_notice(p_notice_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_from text;
begin
  if not public.is_admin_at_least('admin') then
    raise exception '공지를 내릴 권한이 없습니다' using errcode = '42501';
  end if;
  select status into v_from from public.notices where notice_id = p_notice_id for update;
  if v_from is null then raise exception '공지를 찾을 수 없습니다'; end if;
  update public.notices set status = 'hidden', updated_by = auth.uid(), updated_at = now()
   where notice_id = p_notice_id;
  insert into public.admin_action_logs (actor_admin_id, target_type, target_id, action_type, from_status, to_status)
  values (auth.uid(), 'notice', p_notice_id, 'notice_hide', v_from, 'hidden');
end $$;

-- ⚠️ Postgres 함수는 기본으로 PUBLIC에 EXECUTE가 열려 있다 — 반드시 회수
revoke execute on function public.admin_save_notice(uuid, text, text, text, boolean, text, text) from public, anon;
revoke execute on function public.admin_publish_notice(uuid, boolean) from public, anon;
revoke execute on function public.admin_hide_notice(uuid) from public, anon;
grant execute on function public.admin_save_notice(uuid, text, text, text, boolean, text, text) to authenticated;
grant execute on function public.admin_publish_notice(uuid, boolean) to authenticated;
grant execute on function public.admin_hide_notice(uuid) to authenticated;

comment on table public.notices is '공지사항(planning/37). 쓰기는 admin_* RPC만. 게시 시 notifications(type=notice) 팬아웃, 푸시는 notice-push 엣지 함수';
