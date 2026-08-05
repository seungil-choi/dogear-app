-- 죽은 커버 이미지 URL 정리 (장소 데이터 점검 doc 36)
--
-- 배경:
--   서울시 공원 API에서 가져온 커버 이미지 10건이
--   `http://parks.seoul.go.kr/file/info/view.do?fIdx=NNNN` 형태였는데,
--   실제로 호출해보면 HTTP는 302, HTTPS는 200이지만 **본문 0바이트 / text-plain** 으로
--   이미지가 아니다. 그 10곳만 깨진 빈 썸네일이 떠서 나머지 일러스트와 뒤섞여 보였다.
--
-- 조치:
--   해당 URL을 NULL로 비워 번들 일러스트 폴백(공원구분별 11종)이 적용되게 한다.
--   실사진이 확보되면 그때 다시 채운다.
--
-- 멱등: 조건에 해당하는 행이 없으면 아무 것도 하지 않는다.

update public.spots
   set cover_image_url = null
 where cover_image_url like '%parks.seoul.go.kr/file/info/view.do%';
