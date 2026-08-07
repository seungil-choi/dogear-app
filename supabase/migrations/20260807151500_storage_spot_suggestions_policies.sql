-- spot-suggestions 버킷에 업로드 정책을 추가한다.
--
-- 현황:
--   버킷은 만들어져 있고 앱 타입(ImageBucket)에도 정의돼 있는데,
--   storage.objects에 이 버킷용 INSERT 정책이 하나도 없어 업로드가 원천 차단이었다.
--   그 결과 장소 제안 사진은 업로드되지 못하고, 앱은 로컬 file:// 경로를 그대로
--   DB(spot_suggestions.cover_image_url)에 넣었다. 승인 시 그 값이 공개 장소의
--   커버 이미지로 복사되므로 모두에게 깨진 이미지가 된다.
--
-- 규칙은 다른 두 버킷과 동일 — 경로 첫 세그먼트 = auth.uid().

drop policy if exists spot_suggestions_insert on storage.objects;
create policy spot_suggestions_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'spot-suggestions'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists spot_suggestions_delete on storage.objects;
create policy spot_suggestions_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'spot-suggestions'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
