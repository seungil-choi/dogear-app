/**
 * GA4는 처리방침에 적은 만큼만 보낸다(2026-10-17).
 * ① 시행일(2026.10.25) 전에는 수집을 켜지 않는다 ② 이용자가 끄면 끈다
 * ③ 장소 ID·지역·거리 같은 값은 보내지 않는다 ④ 화면 이름에 실제 ID가 들어가지 않는다
 */
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore[k] ?? null,
    setItem: async (k: string, v: string) => { mockStore[k] = v; },
    removeItem: async (k: string) => { delete mockStore[k]; },
  },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../../config/env', () => ({ IS_REAL_AUTH: true }));
jest.mock('../errorReporter', () => ({ reportError: jest.fn() }));

const mockFb = {
  getAnalytics: jest.fn(() => ({})),
  setConsent: jest.fn(async () => {}),
  setAnalyticsCollectionEnabled: jest.fn(async () => {}),
  logEvent: jest.fn(async () => {}),
};
jest.mock('@react-native-firebase/analytics', () => mockFb, { virtual: false });

function loadGa4() {
  (global as any).__DEV__ = false;
  let m: typeof import('../ga4');
  jest.isolateModules(() => { m = require('../ga4'); });
  return m!;
}

beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
  Object.values(mockFb).forEach(f => (f as jest.Mock).mockClear());
});
afterEach(() => jest.useRealTimers());

it('시행일 전에는 수집을 켜지 않고 아무것도 보내지 않는다', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-24T23:59:00+09:00'));
  const ga = loadGa4();
  await ga.applyGa4Collection();
  expect(mockFb.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({}, false);
  ga.ga4Event('home_viewed', { screen_name: 'home' });
  expect(mockFb.logEvent).not.toHaveBeenCalled();
});

it('시행일 이후 켜지고, 허용 목록 밖의 값(장소 ID·분류·지역·거리)은 빠진다', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-25T00:00:01+09:00'));
  const ga = loadGa4();
  await ga.applyGa4Collection();
  expect(mockFb.setConsent).toHaveBeenCalledWith({}, expect.objectContaining({ ad_storage: false, ad_personalization: false }));
  expect(mockFb.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({}, true);
  ga.ga4Event('pawmark_blocked_too_far', {
    screen_name: 'paw_checkin', place_category: 'park',
    place_id: 'spot-123', region_sigungu: '마포구', distance_bucket: '100_300m',
  });
  expect(mockFb.logEvent).toHaveBeenCalledWith({}, 'pawmark_blocked_too_far', { screen_name: 'paw_checkin' });
});

it('이용자가 끄면 즉시 끄고 이후 이벤트를 보내지 않는다', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00+09:00'));
  const ga = loadGa4();
  await ga.applyGa4Collection();
  await ga.setGa4OptOut(true);
  expect(mockFb.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith({}, false);
  expect(await ga.getGa4OptOut()).toBe(true);
  ga.ga4Event('home_viewed', { screen_name: 'home' });
  expect(mockFb.logEvent).not.toHaveBeenCalled();
});

it('화면 이름은 라우트 이름만 — 그룹은 빼고 실제 ID는 들어가지 않는다', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00+09:00'));
  const ga = loadGa4();
  await ga.applyGa4Collection();
  ga.ga4Screen(['(tabs)', 'map']);
  ga.ga4Screen(['spot', '[id]']);
  expect(mockFb.logEvent).toHaveBeenNthCalledWith(1, {}, 'screen_view', { screen_name: 'map', screen_class: 'map' });
  expect(mockFb.logEvent).toHaveBeenNthCalledWith(2, {}, 'screen_view', { screen_name: 'spot/[id]', screen_class: 'spot/[id]' });
});
