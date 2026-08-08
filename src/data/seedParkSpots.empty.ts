// 프로덕션 빌드용 빈 스텁.
//
// seedParkSpots.ts는 2.94MB(약 5,300개 공원)짜리 데모 시드다.
// IS_DEV_SEED=false(실서비스)에서는 장소를 전부 Supabase에서 받으므로 한 건도 쓰이지 않는데,
// mockData.ts가 정적 import하고 useAppStore가 mockData를 정적 import하는 탓에
// 프로덕션 번들에 그대로 실렸다 — 안드로이드 Hermes 번들 실측 8.27MB 중 0.92MB.
//
// metro.config.js가 EXPO_PUBLIC_DEV_SEED !== 'true'일 때 이 파일로 치환한다.
import type { Spot } from '../types';

export const seedParkSpots: Spot[] = [];
