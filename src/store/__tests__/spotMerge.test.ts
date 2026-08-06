/**
 * 스팟 병합 규칙 회귀 테스트.
 *
 * 여기서 실제로 두 번 사고가 났다.
 *  1) 지도 팬 페치가 subcategory를 안 담아 오는데 통째로 덮어써서
 *     목록 썸네일이 상세와 달라졌다.
 *  2) 누적 상한을 넣으면서 저장·방문한 장소가 evict돼 "내 장소"가 사라질 뻔했다.
 */
import { mergeSpotList } from '../spotMerge';
import type { Spot } from '../../types';

const spot = (id: string, extra: Partial<Spot> = {}): Spot => ({
  spot_id: id,
  name: id,
  category: 'park',
  latitude: 37.5,
  longitude: 127.0,
  status: 'active',
  created_source: 'seed',
  created_at: '2026-01-01T00:00:00Z',
  ...extra,
});

const ctx = (over: Partial<Parameters<typeof mergeSpotList>[2]> = {}) => ({
  savedSpotIds: [],
  visitedSpotIds: [],
  selectedSpotId: null,
  max: 5,
  ...over,
});

describe('mergeSpotList — 필드 보존', () => {
  it('새 객체에 없는 subcategory가 기존 값을 지우지 않는다', () => {
    const cur = [spot('a', { subcategory: '어린이공원' })];
    const inc = [spot('a', { subcategory: undefined, name: 'a-갱신' })];
    const [merged] = mergeSpotList(cur, inc, ctx());
    expect(merged.subcategory).toBe('어린이공원');
    expect(merged.name).toBe('a-갱신');
  });

  it('지도 페치가 안 담아오는 필드(features·description)도 보존한다', () => {
    const cur = [spot('a', { features: ['그늘 많음'], description: '설명' })];
    const inc = [spot('a')];
    const [merged] = mergeSpotList(cur, inc, ctx());
    expect(merged.features).toEqual(['그늘 많음']);
    expect(merged.description).toBe('설명');
  });

  it('null도 기존 값을 덮지 않는다', () => {
    const cur = [spot('a', { subcategory: '근린공원' })];
    const inc = [spot('a', { subcategory: null })];
    expect(mergeSpotList(cur, inc, ctx())[0].subcategory).toBe('근린공원');
  });
});

describe('mergeSpotList — 중복·상한', () => {
  it('spot_id 기준으로 중복이 생기지 않는다', () => {
    const r = mergeSpotList([spot('a'), spot('b')], [spot('b'), spot('c')], ctx());
    expect(r.map(s => s.spot_id)).toEqual(['a', 'b', 'c']);
  });

  it('상한을 넘으면 오래된 것부터 버린다', () => {
    const cur = ['a', 'b', 'c', 'd', 'e'].map(id => spot(id));
    const r = mergeSpotList(cur, [spot('f'), spot('g')], ctx());
    expect(r).toHaveLength(5);
    expect(r.map(s => s.spot_id)).toEqual(['c', 'd', 'e', 'f', 'g']);
  });

  it('상한 이하면 아무것도 버리지 않는다', () => {
    const r = mergeSpotList([spot('a')], [spot('b')], ctx());
    expect(r).toHaveLength(2);
  });
});

describe('mergeSpotList — 내 장소 보호', () => {
  it('저장·방문·선택한 장소는 상한을 넘어도 남는다', () => {
    const cur = ['a', 'b', 'c', 'd', 'e'].map(id => spot(id));
    const r = mergeSpotList(cur, [spot('f'), spot('g'), spot('h')],
      ctx({ savedSpotIds: ['a'], visitedSpotIds: ['b'], selectedSpotId: 'c' }));
    const ids = r.map(s => s.spot_id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c', 'f', 'g', 'h']));
  });

  it('보호 대상이 상한을 넘겨도 이번에 불러온 장소는 절대 버리지 않는다', () => {
    // 지금 보고 있는 지역의 핀이 사라지면 안 된다
    const cur = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => spot(id));
    const r = mergeSpotList(cur, [spot('z')],
      ctx({ savedSpotIds: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(r.map(s => s.spot_id)).toContain('z');
  });

  it('한 번에 상한보다 많이 들어와도 전부 유지한다(팬 1회 150개)', () => {
    const inc = Array.from({ length: 8 }, (_, i) => spot(`n${i}`));
    const r = mergeSpotList([spot('a'), spot('b')], inc, ctx());
    expect(r.filter(s => s.spot_id.startsWith('n'))).toHaveLength(8);
  });
});
