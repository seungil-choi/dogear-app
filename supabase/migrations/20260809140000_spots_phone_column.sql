-- spots.phone — 시설에는 전화가 핵심 정보다
--
-- 공공데이터에 전화번호가 들어 있는데(동물병원 영업중 5,460건 중 3,032건) 담을
-- 컬럼이 없어서 적재 RPC가 staging까지만 받고 버리고 있었다.
-- 병원 화면에서 사용자가 가장 먼저 찾는 게 전화다 — "지금 진료하나요"는
-- 영업시간 데이터가 없는 지금 전화로만 확인된다.
--
-- 산책지(공원·산책로)는 전화가 없다. nullable로 둔다.
-- 적재 결과: 동물병원 2,895/5,244(55%) · 애견미용 2,176/9,846(22%)
alter table public.spots add column if not exists phone text;

comment on column public.spots.phone is
  '대표 전화. 공공데이터 원본의 전화번호. 산책지는 null.';
