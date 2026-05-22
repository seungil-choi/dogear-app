/**
 * 통합 이벤트 트래킹 모듈
 *
 * 목적:
 *  - 어드민에서 서비스 건강도(WAU·발도장 완료·전환율 등)를 측정할 수 있도록 핵심 행동을 수집
 *  - 단순 로그가 아니라 "누가 / 어떤 강아지로 / 어떤 장소에서 / 어느 화면에서" 일어났는지 함께 기록
 *
 * 환경:
 *  - DEV_SEED 모드: console.log만 (어드민 미연결 단계)
 *  - 실 환경: Supabase `events` 테이블에 INSERT (RLS: 본인 user_id만 INSERT 가능)
 *
 * 비용 0 원칙:
 *  - 외부 분석 SDK(PostHog/Amplitude/GA) 의존 X
 *  - Supabase 단일 인스턴스로 처리
 *
 * 네이밍 규칙 (Dogear 구현 지시문 5.1):
 *  - 화면 진입: `_viewed`
 *  - 클릭/선택: `_clicked`
 *  - 시작: `_started`
 *  - 완료: `_completed`
 *  - 제출: `_submitted`
 *  - 실패: `_failed`
 *  - 제한/차단: `_blocked`
 */

import { supabase } from '../lib/supabase';
import { IS_REAL_AUTH as IS_REAL } from '../config/env';

// ─── 이벤트 이름 화이트리스트 (오타·중복 명명 방지) ─────────────────
export const EVENT = {
  // 온보딩 / 가입
  signup_completed:                  'signup_completed',
  login_completed:                   'login_completed',
  dog_profile_create_started:        'dog_profile_create_started',
  dog_profile_create_completed:      'dog_profile_create_completed',
  // 홈
  home_viewed:                       'home_viewed',
  recommended_place_clicked:         'recommended_place_clicked',
  recent_place_clicked:              'recent_place_clicked',
  frequent_place_clicked:            'frequent_place_clicked',
  // 탐색
  explore_viewed:                    'explore_viewed',
  map_viewed:                        'map_viewed',
  list_viewed:                       'list_viewed',
  search_performed:                  'search_performed',
  filter_applied:                    'filter_applied',
  place_card_clicked:                'place_card_clicked',
  // 장소 상세
  place_detail_viewed:               'place_detail_viewed',
  place_saved:                       'place_saved',
  place_unsaved:                     'place_unsaved',
  navigation_clicked:                'navigation_clicked',
  frequent_dogs_opened:              'frequent_dogs_opened',
  recent_traces_opened:              'recent_traces_opened',
  // 발도장
  pawmark_start_clicked:             'pawmark_start_clicked',
  pawmark_visibility_selected:       'pawmark_visibility_selected',
  pawmark_tags_selected:             'pawmark_tags_selected',
  pawmark_note_added:                'pawmark_note_added',
  pawmark_photo_added:               'pawmark_photo_added',
  pawmark_completed:                 'pawmark_completed',
  pawmark_blocked_cooldown:          'pawmark_blocked_cooldown',
  pawmark_blocked_daily_limit:       'pawmark_blocked_daily_limit',
  pawmark_blocked_too_far:           'pawmark_blocked_too_far',
  pawmark_blocked_no_location:       'pawmark_blocked_no_location',
  pawmark_blocked_low_accuracy:      'pawmark_blocked_low_accuracy',
  pawmark_submit_failed:             'pawmark_submit_failed',
  // 장소 제안
  place_suggestion_start:            'place_suggestion_start',
  place_suggestion_submitted:        'place_suggestion_submitted',
  place_suggestion_submit_failed:    'place_suggestion_submit_failed',
  // 신고 / 운영 이상징후
  report_place_submitted:            'report_place_submitted',
  report_photo_submitted:            'report_photo_submitted',
  photo_upload_failed:               'photo_upload_failed',
  duplicate_candidate_created:       'duplicate_candidate_created',
  import_batch_failed:               'import_batch_failed',
  import_batch_partially_succeeded:  'import_batch_partially_succeeded',
  suspicious_pawmark_pattern_detected: 'suspicious_pawmark_pattern_detected',
} as const;

export type EventName = keyof typeof EVENT;

// ─── 공통 속성 — 세션·사용자·화면 컨텍스트 ─────────────────────────
interface UserContext {
  user_id?: string | null;
  dog_profile_id?: string | null;
  session_id?: string;
}

// 세션 ID — 앱 마운트 시 한 번 생성, persist 없이 메모리만 유지
const SESSION_ID = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// 모듈 레벨 컨텍스트 — store에서 setUserContext()로 주입
let userCtx: UserContext = { session_id: SESSION_ID };
let currentScreen: string | null = null;

export function setUserContext(ctx: { user_id?: string | null; dog_profile_id?: string | null }) {
  userCtx = { ...userCtx, ...ctx };
}

export function setCurrentScreen(screen: string | null) {
  currentScreen = screen;
}

// ─── 트랙 함수 — 단일 진입점 ────────────────────────────────────
export interface TrackProps {
  // 화면 컨텍스트
  screen_name?: string;
  source_screen?: string;
  // 장소 컨텍스트
  place_id?: string;
  place_category?: string;
  region_sido?: string;
  region_sigungu?: string;
  // 추가 자유 속성
  [key: string]: any;
}

/**
 * 이벤트 추적 — fire-and-forget
 *  - 실패해도 사용자 흐름에는 영향 X (await 안 해도 됨)
 *  - DEV_SEED: console.log
 *  - 실 환경: supabase events 테이블 INSERT
 */
export function track(name: EventName, props: TrackProps = {}): void {
  const occurred_at = new Date().toISOString();
  const payload = {
    event_name: name,
    occurred_at,
    user_id:        userCtx.user_id ?? null,
    dog_profile_id: userCtx.dog_profile_id ?? null,
    session_id:     userCtx.session_id ?? SESSION_ID,
    screen_name:    props.screen_name ?? currentScreen ?? null,
    source_screen:  props.source_screen ?? null,
    place_id:       props.place_id ?? null,
    place_category: props.place_category ?? null,
    region_sido:    props.region_sido ?? null,
    region_sigungu: props.region_sigungu ?? null,
    properties:     extractExtras(props),  // 자유 속성은 jsonb 컬럼으로
  };

  if (!IS_REAL) {
    // DEV_SEED 모드: 콘솔에만 — 어드민 미연결 단계
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[event]', name, payload);
    }
    return;
  }

  // 실 환경 — fire-and-forget INSERT
  supabase.from('events').insert(payload).then(({ error }) => {
    if (error) {
      // 분석 실패는 사용자 흐름에 영향 안 가게 silent
      // eslint-disable-next-line no-console
      console.warn('[event] insert failed:', error.message);
    }
  });
}

// 자유 속성에서 표준 컬럼 제외하고 properties로 분리
function extractExtras(props: TrackProps): Record<string, any> {
  const STANDARD = new Set([
    'screen_name', 'source_screen', 'place_id', 'place_category',
    'region_sido', 'region_sigungu',
  ]);
  const extras: Record<string, any> = {};
  for (const k of Object.keys(props)) {
    if (!STANDARD.has(k)) extras[k] = props[k];
  }
  return Object.keys(extras).length > 0 ? extras : {};
}
