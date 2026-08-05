-- 장소 표시명 큐레이션 (장소 데이터 점검 doc 36 · D-1/D-2/D-5/D-7)
--
-- 문제:
--   공공데이터 원본 이름이 그대로 노출돼 사용자가 기억·구분할 수 없다.
--     · `13호공원`, `47호공원` 처럼 번호만 있는 이름 233건(전량 경기)
--     · 같은 시군구에 동일 이름 45그룹 110건 (화성시 `47호공원` ×8 등)
--   제품 가치("우리 강아지의 장소를 기억하다")와 정면으로 충돌한다.
--
-- 설계:
--   원본은 `name_original`에 보존하고 `name`을 표시용으로 정규화한다.
--   컬럼을 새로 노출하지 않으므로 RPC·엣지·클라이언트 변경이 필요 없다.
--   공공데이터를 재수입해도 이 마이그레이션을 다시 돌리면 같은 결과가 된다(멱등).
--
-- 규칙 (우선순위 순):
--   R0 원본에 실제 이름이 박혀 있으면 그것을 쓴다
--      `1호어린이 파릇파릇 어린이공원` → `파릇파릇 어린이공원`            (18건)
--   R1 괄호 안에 고유명이 있으면 그것을 쓴다
--      `3호 어린이공원(가온공원)` → `가온공원`                            (13건)
--   R2 동/읍/면/리를 앞에 붙인다  `13호공원` → `청계동 13호공원`          (194건)
--   R3 동이 없으면 구를 붙인다   `67호소공원` → `팔달구 67호소공원`        (8건)
--
-- 되돌리기: update spots set name = name_original where name_original is not null;

-- 1) 원본 보존 컬럼
alter table public.spots add column if not exists name_original text;

comment on column public.spots.name_original is
  '공공데이터 원본 이름. name은 표시용으로 정규화될 수 있으므로 원본을 여기 보존한다.';

-- 최초 1회만 채운다(이미 있으면 유지 → 재실행해도 원본이 덮이지 않음)
update public.spots
   set name_original = name
 where name_original is null;

-- 2) 번호형 이름 정규화 — 항상 원본(name_original) 기준으로 계산해 멱등성 확보
with s as (
  select spot_id,
         name_original as src,
         address_text,
         (regexp_match(name_original, '^[0-9]+호(?:근린|어린이|체육|소|문화|수변|역사)\s+(.+)$'))[1] as embedded,
         (regexp_match(name_original, '\(([가-힣][가-힣0-9 ]*)\)'))[1] as paren_name,
         coalesce(
           (regexp_match(address_text, '([가-힣]+[0-9]*(?:동|읍|면|리))(?:[ 0-9]|$)'))[1],
           (regexp_match(address_text, '\(([가-힣]+동)\)'))[1]
         ) as dong,
         (regexp_match(address_text, '([가-힣]+구)(?: |$)'))[1] as gu,
         (regexp_match(name_original, '(근린공원|어린이공원|소공원|문화공원|체육공원|수변공원|역사공원|공원)$'))[1] as ptype
    from public.spots
   where status = 'active' and name_original ~ '^[0-9]+호'
)
update public.spots sp
   set name = btrim(regexp_replace(
         case
           when s.embedded    is not null then s.embedded
           when s.paren_name  is not null and s.paren_name ~ '(공원|놀이터|광장)$' then s.paren_name
           when s.paren_name  is not null then s.paren_name || ' ' || coalesce(s.ptype, '공원')
           when s.dong        is not null then s.dong || ' ' || s.src
           when s.gu          is not null then s.gu   || ' ' || s.src
           else s.src
         end, '\s+', ' ', 'g'))
  from s
 where sp.spot_id = s.spot_id;

-- 3) `(가칭)` 표기 제거 — 확정 전 명칭이 그대로 노출되던 6건
--    ⚠️ 미조성 공원일 가능성이 있어 실재 여부는 별도 확인이 필요하다(doc 36 D-5).
update public.spots
   set name = btrim(regexp_replace(regexp_replace(name_original, '\(가칭\)', '', 'g'), '\s+', ' ', 'g'))
 where status = 'active' and name_original ~ '가칭';

-- 4) 주소 시도 표기 통일 — `서울` 40건을 `서울특별시`로 (doc 36 D-7)
update public.spots
   set address_text = regexp_replace(address_text, '^서울 ', '서울특별시 ')
 where status = 'active' and address_text ~ '^서울 ';
