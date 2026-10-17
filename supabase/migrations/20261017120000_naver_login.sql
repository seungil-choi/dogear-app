-- 네이버 로그인 (2026-10-17, 1.0.2)
--
-- 방식: 네이버 SDK 대신 서버 경유 웹 로그인(OAuth authorization code).
--   네이버 SDK는 client secret을 앱에 넣어야 해서(번들에서 추출 가능) 보류했었다(SEC-07).
--   이번엔 앱이 secret을 갖지 않는다: naver-auth 엣지 함수가 code를 secret으로 교환하므로
--   "다른 앱에서 받은 토큰" 문제(audience 미검증)도 구조적으로 사라진다.
--   앱 ↔ 서버 사이는 PKCE와 같은 원리(verifier/challenge)로 일회용 교환 코드를 묶는다 —
--   dogear:// 링크를 다른 앱이 가로채도 verifier 없이는 세션을 받을 수 없다.

-- ① 로그인 유형
alter type public.login_type add value if not exists 'naver';

-- ② 일회용 교환 코드 (엣지 함수 service_role 전용, 5분 유효·1회)
create table if not exists public.oauth_exchanges (
  code        text primary key,
  challenge   text not null,
  email       text not null,
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
alter table public.oauth_exchanges enable row level security;
revoke all on public.oauth_exchanges from anon, authenticated;

-- ③ 기능 스위치 — 앱이 읽어서 버튼을 보이거나 숨긴다(빌드 없이 켜고 끄기)
--    naver_login: 네이버 검수 통과 전에는 꺼 둔다(검수 전엔 등록된 테스트 계정만 로그인된다)
create table if not exists public.app_flags (
  key         text primary key,
  enabled     boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now()
);
alter table public.app_flags enable row level security;
drop policy if exists app_flags_read on public.app_flags;
create policy app_flags_read on public.app_flags for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_flags from anon, authenticated;
insert into public.app_flags (key, enabled, note)
values ('naver_login', false, '네이버 검수 통과 후 true')
on conflict (key) do nothing;
