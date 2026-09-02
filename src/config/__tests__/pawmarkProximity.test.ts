/**
 * 발도장 근접 정책을 잠근다.
 *
 * 왜 테스트가 필요한가:
 *   집에서 공원 발도장이 찍히는 사고가 있었다. 원인은 두 가지였고 둘 다 여기서 막는다.
 *     ① 허용 반경이 넓었다(공원 100m + 정확도 마진 최대 50m = 실질 150m)
 *        → 2026-08-23 1차 조정: 공원 30 / 산책로·해변 50 / 강변 100 / 나머지 10
 *        → 2026-09-02 재상향: 10m가 과했다. 도심 GPS 오차가 20~40m라
 *           "병원 앞에 서 있는데 안 찍힘"이 잦았다. 강변 150 / 나머지 2배.
 *           목적은 '그 건물에 있었다' 확인이지 '그 문 앞에 섰다' 증명이 아니다.
 *     ② 마진에 상한이 없어 **정확도가 나쁠수록 더 관대해졌다** — 정반대여야 한다
 *
 *   같은 값이 서버(supabase/functions/paw-checkin)에도 복제돼 있다. Deno라 import가
 *   안 돼서 값을 옮겨 적는 구조라, 한쪽만 고치면 조용히 어긋난다.
 *   ⚠️ 이 파일을 고칠 일이 생기면 **서버도 같이 고쳤는지 확인할 것.**
 */
import { PAWMARK_PROXIMITY, getPawmarkRadius } from '../checkin';

describe('발도장 허용 반경', () => {
  it('공원 60 / 산책로·해변 100 / 강변 150', () => {
    expect(getPawmarkRadius('park')).toBe(60);
    expect(getPawmarkRadius('trail')).toBe(100);
    expect(getPawmarkRadius('beach')).toBe(100);
    expect(getPawmarkRadius('riverside')).toBe(150);
  });

  it('시설(카페·병원·미용·호텔)과 쉼터·기타는 20m — 넓히되 옆 건물까지 가면 안 된다', () => {
    for (const c of ['pet_cafe', 'vet', 'pet_grooming', 'pet_boarding', 'rest_spot', 'other'] as const) {
      expect(getPawmarkRadius(c)).toBe(20);
    }
  });

  it('모르는 카테고리는 가장 좁은 기본값을 쓴다', () => {
    expect(getPawmarkRadius(undefined)).toBe(PAWMARK_PROXIMITY.DEFAULT_RADIUS_M);
    expect(PAWMARK_PROXIMITY.DEFAULT_RADIUS_M).toBe(20);
  });

  it('어떤 카테고리도 150m를 넘지 않는다 — 상한이 없으면 다시 집에서 찍힌다', () => {
    const all = ['park', 'trail', 'riverside', 'beach', 'rest_spot',
                 'pet_cafe', 'vet', 'pet_grooming', 'pet_boarding', 'other'] as const;
    for (const c of all) expect(getPawmarkRadius(c)).toBeLessThanOrEqual(150);
  });
});

describe('정확도 마진', () => {
  /** geo.ts·서버가 쓰는 것과 같은 식 */
  const margin = (accuracy: number) =>
    Math.min(accuracy * PAWMARK_PROXIMITY.ACCURACY_MARGIN_RATIO,
             PAWMARK_PROXIMITY.MAX_ACCURACY_MARGIN_M);

  it('상한이 있다 — 정확도가 나쁠수록 관대해지면 안 된다', () => {
    expect(margin(10)).toBe(5);
    expect(margin(40)).toBe(20);
    expect(margin(500)).toBe(PAWMARK_PROXIMITY.MAX_ACCURACY_MARGIN_M);
  });

  it('공원 실질 허용치는 최대 80m다 (60 + 마진 상한 20)', () => {
    expect(getPawmarkRadius('park') + margin(9999)).toBe(80);
  });

  it('시설 실질 허용치는 최대 40m다 (20 + 마진 상한 20)', () => {
    expect(getPawmarkRadius('vet') + margin(9999)).toBe(40);
  });

  it('정확도가 50m보다 나쁘면 아예 차단한다', () => {
    expect(PAWMARK_PROXIMITY.MIN_ACCURACY_M).toBe(50);
  });
});
