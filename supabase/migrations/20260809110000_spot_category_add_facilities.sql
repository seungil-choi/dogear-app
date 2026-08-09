-- spot_category 확장 — 편의시설 3종 추가 + 앱과의 불일치 해소
--
-- 추가:
--   vet          동물병원      (행안부 전국동물병원표준데이터)
--   pet_grooming 애견 미용     (LOCALDATA 동물미용업)
--   pet_boarding 애견 호텔·유치원 (LOCALDATA 동물위탁관리업)
--
-- ⚠️ pet_cafe / beach도 함께 넣는다. 이건 신규 기능이 아니라 버그 수정이다.
--    app/suggest-spot.tsx의 CATEGORY_OPTIONS는 이미 이 둘을 사용자에게 보여주고 있는데
--    enum에 값이 없어서, 고르는 순간 spots INSERT가 22P02로 거부돼 왔다.
--    사용자에게는 "장소 제안에 실패했어요"만 떠서 원인을 알 수 없었다.
--    (실측: select 'pet_cafe'::spot_category → ERROR 22P02)
--
-- enum 값은 Postgres에서 되돌리기 어렵다. 지금 실제로 화면에 있거나
-- 바로 데이터를 넣을 것만 추가한다 — 나중에 쓸지 모르는 값은 넣지 않는다.

alter type public.spot_category add value if not exists 'pet_cafe';
alter type public.spot_category add value if not exists 'beach';
alter type public.spot_category add value if not exists 'vet';
alter type public.spot_category add value if not exists 'pet_grooming';
alter type public.spot_category add value if not exists 'pet_boarding';
