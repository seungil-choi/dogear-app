/**
 * 발도장 근접 정책이 **클라이언트와 서버에서 같은 값인지** 지킨다.
 *
 * 왜 테스트로 두는가: 이 값들은 두 곳에 복제돼 있다(Deno 환경이라 TS import 불가).
 * 사람이 "바꿀 때 양쪽 고치기"를 기억하는 방식은 반드시 어긋난다.
 * 어긋나면 증상이 고약하다 — **클라이언트는 통과시키고 서버가 거부**해서,
 * 사용자는 버튼이 활성인데 저장만 실패하는 화면을 본다.
 *
 * 서버 파일을 텍스트로 읽어 비교한다. import하면 Deno 전용 구문에서 깨진다.
 */
import fs from 'fs';
import path from 'path';
import { PAWMARK_PROXIMITY, getPawmarkRadius } from '../checkin';

const serverSrc = fs.readFileSync(
  path.join(__dirname, '../../../supabase/functions/paw-checkin/index.ts'),
  'utf-8',
);

/** 서버 소스에서 `키: 숫자` 또는 `const 키 = 숫자` 를 뽑는다. */
function serverNum(key: string): number | null {
  const m =
    serverSrc.match(new RegExp(`\\b${key}\\s*:\\s*([0-9.]+)`)) ??
    serverSrc.match(new RegExp(`const\\s+${key}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
}

describe('발도장 근접 정책 — 클라/서버 미러', () => {
  const categories = [
    'park', 'trail', 'riverside', 'beach', 'rest_spot',
    'pet_cafe', 'vet', 'pet_grooming', 'pet_boarding',
  ] as const;

  it.each(categories)('카테고리 반경이 서버와 같다 — %s', (cat) => {
    // 공개 API로 검사한다 — 내부 테이블이 아니라 실제로 쓰이는 값이 기준이다.
    expect(serverNum(cat)).toBe(getPawmarkRadius(cat as any));
  });

  it.each([
    ['DEFAULT_RADIUS_M',      PAWMARK_PROXIMITY.DEFAULT_RADIUS_M],
    ['MIN_ACCURACY_M',        PAWMARK_PROXIMITY.MIN_ACCURACY_M],
    ['ACCURACY_MARGIN_RATIO', PAWMARK_PROXIMITY.ACCURACY_MARGIN_RATIO],
    ['MAX_ACCURACY_MARGIN_M', PAWMARK_PROXIMITY.MAX_ACCURACY_MARGIN_M],
  ] as const)('정책값이 서버와 같다 — %s', (key, client) => {
    expect(serverNum(key)).toBe(client);
  });

  it('미지정 카테고리는 양쪽 다 기본값으로 떨어진다', () => {
    expect(getPawmarkRadius(undefined)).toBe(PAWMARK_PROXIMITY.DEFAULT_RADIUS_M);
    expect(serverNum('DEFAULT_RADIUS_M')).toBe(PAWMARK_PROXIMITY.DEFAULT_RADIUS_M);
  });
});
