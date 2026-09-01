-- 계정 삭제가 500으로 실패하던 원인 해소 (2026-09-01)
--
-- 증상: 어드민으로 등록된 계정이 탈퇴하면 delete-account가 500.
--   auth.users 삭제 → admins CASCADE → admin_action_logs가 RESTRICT로 막음
--   ERROR: update or delete on table "admins" violates foreign key constraint
--          "admin_action_logs_actor_admin_id_fkey" (SQLSTATE 23503)
--   ※ 일반 사용자는 영향 없었다. 어드민 + 조치 이력이 있는 계정만 걸렸다.
--
-- 판단: 원장은 감사 기록이다. CASCADE(같이 삭제)는 이의제기 대응 근거를 없앤다.
--   SET NULL로 링크만 끊되, **행위자를 잃지 않도록 이메일 스냅샷을 먼저 남긴다.**
--   (이 DB의 다른 감사성 FK — moderation_actions/appeals/edit_suggestions — 는 이미 SET NULL)

alter table admin_action_logs add column if not exists actor_email_snapshot text;
alter table admin_read_logs   add column if not exists admin_email_snapshot text;

update admin_action_logs l set actor_email_snapshot = a.email
  from admins a where a.id = l.actor_admin_id and l.actor_email_snapshot is null;
update admin_read_logs l set admin_email_snapshot = a.email
  from admins a where a.id = l.admin_id and l.admin_email_snapshot is null;

-- 신규 행은 트리거가 채운다 → 앱/어드민 코드 변경 불필요
create or replace function fill_admin_action_actor_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.actor_email_snapshot is null and new.actor_admin_id is not null then
    select email into new.actor_email_snapshot from admins where id = new.actor_admin_id;
  end if;
  return new;
end $$;
revoke execute on function fill_admin_action_actor_email() from public;   -- PUBLIC EXECUTE 함정 회수

create or replace function fill_admin_read_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.admin_email_snapshot is null and new.admin_id is not null then
    select email into new.admin_email_snapshot from admins where id = new.admin_id;
  end if;
  return new;
end $$;
revoke execute on function fill_admin_read_email() from public;

drop trigger if exists trg_fill_admin_action_actor_email on admin_action_logs;
create trigger trg_fill_admin_action_actor_email
  before insert on admin_action_logs
  for each row execute function fill_admin_action_actor_email();

drop trigger if exists trg_fill_admin_read_email on admin_read_logs;
create trigger trg_fill_admin_read_email
  before insert on admin_read_logs
  for each row execute function fill_admin_read_email();

alter table admin_action_logs alter column actor_admin_id drop not null;
alter table admin_read_logs   alter column admin_id       drop not null;

alter table admin_action_logs drop constraint admin_action_logs_actor_admin_id_fkey;
alter table admin_action_logs add  constraint admin_action_logs_actor_admin_id_fkey
  foreign key (actor_admin_id) references admins(id) on delete set null;

alter table admin_read_logs drop constraint admin_read_logs_admin_id_fkey;
alter table admin_read_logs add  constraint admin_read_logs_admin_id_fkey
  foreign key (admin_id) references admins(id) on delete set null;

comment on column admin_action_logs.actor_email_snapshot is
  '행위자 이메일 스냅샷. 어드민 탈퇴 시 actor_admin_id는 NULL이 되지만 책임 추적은 이 값으로 유지된다.';
comment on column admin_read_logs.admin_email_snapshot is
  '열람자 이메일 스냅샷. 탈퇴 후에도 열람 이력의 주체를 남긴다.';
