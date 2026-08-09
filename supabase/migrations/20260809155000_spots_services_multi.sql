-- spots.services — 한 장소가 여러 서비스를 제공한다
--
-- 왜 필요한가:
--   동물위탁관리업 5,708건(영업중·좌표있음) 중 3,481건(61%)이 이미 적재된
--   동물병원·애견미용과 같은 상호·같은 자리다. 애견호텔이 미용도 하고,
--   동물병원이 호텔도 하는 게 흔하기 때문이다.
--   유형이 하나뿐인 구조에서는 이 3,481곳이 '미용' 또는 '병원'으로만 남고
--   "애견 호텔" 필터에서 사라진다 — 호텔 10곳 중 6곳이 안 보이는 기능이 된다.
--   핀을 두 개 찍는 것도 답이 아니다(같은 자리에 같은 이름이 겹친다).
--
-- 모델:
--   category  = 대표 유형 (아이콘·핀 글리프를 정한다. 먼저 적재된 것)
--   services  = 제공 서비스 전부 (필터가 이걸 본다)
--   category는 항상 services에 포함된다.
--
-- 적재 후 실측: 병원 5,244 · 미용 10,775 · 호텔 5,700(원본 5,708의 99.9%)
--   복수 서비스 장소 4,200곳. category가 services에 없는 이상치 0건.

alter table public.spots add column if not exists services text[] not null default '{}';

comment on column public.spots.services is
  '이 장소가 제공하는 서비스 유형 배열(spot_category 값). category는 대표 1개, services는 전부. 한 업체가 병원+미용+호텔을 겸하는 경우가 흔하다.';

update public.spots set services = array[category::text] where services = '{}';

create index if not exists spots_services_gin on public.spots using gin (services);
