-- 계약 불일치 수정 (2026-07-04 라이브 적용): 앱 신고 사유(ReportReason)가 DB check 제약과 달라
-- 'other' 외 모든 신고가 저장 실패(fire-and-forget 무성 실패)하던 문제 → 앱값 허용(합집합).
alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type = any (array[
    'inappropriate_content','harassment','spam','misinformation','animal_abuse','privacy_violation',
    'wrong_location','inappropriate_photo','spam_note','fake_checkin','personal_info',
    'other'
  ]));
