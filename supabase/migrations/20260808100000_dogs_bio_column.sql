-- 강아지 자기소개(선택 입력).
--
-- 등록 화면에 사진과 함께 선택 항목으로 추가한다.
-- 프로필 카드·상세에서 성격 태그만으로는 전해지지 않는 한마디를 담는 자리다.
-- UGC이므로 길이를 제한하고(80자), 모더레이션은 앱의 isObjectionable이 담당한다.

alter table public.dogs
  add column if not exists bio text;

alter table public.dogs
  drop constraint if exists dogs_bio_length;
alter table public.dogs
  add constraint dogs_bio_length check (bio is null or char_length(bio) <= 80);

comment on column public.dogs.bio is
  '강아지 한 줄 소개(선택, 최대 80자). 프로필 카드에 노출된다.';
