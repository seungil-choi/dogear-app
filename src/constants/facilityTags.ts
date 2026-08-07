/**
 * 원천 데이터의 편의시설 태그(spots.tags)를 **견주의 판단 기준**으로 번역한다.
 *
 * 왜 그대로 쓰지 않는가:
 *   원본은 공원 관리 대장의 언어다. 실측 상위값이 조합놀이대(1,162) · 그네(505) · 시소(196)로,
 *   그대로 칩을 뿌리면 "이 공원엔 조합놀이대가 있습니다"가 가장 큰 정보가 된다.
 *   견주가 산책 전에 알고 싶은 건 물·화장실·그늘·주차, 그리고 **피해야 할 이유**다.
 *
 * 이 서비스의 관점:
 *   놀이터와 구기 운동장은 다른 지도 앱에서 장점으로 쓰이지만,
 *   낯가림·짖음이 있는 아이에게는 회피 사유다. 같은 데이터를 반대로 읽는다.
 *
 * 실측 기준(2026-08-07, active 5,317곳 중 편의시설 보유 2,171곳 / 40.8%)
 */
import type { IconName } from '../components/common/Icon';

export type FacilityTone = 'info' | 'caution';

export interface FacilityChip {
  key: string;
  label: string;
  icon: IconName;
  tone: FacilityTone;
}

/** 표기 순서 = 견주에게 중요한 순서. 앞쪽부터 노출된다. */
const GROUPS: Array<FacilityChip & { match: string[] }> = [
  { key: 'water',   label: '물 마실 곳',     icon: 'riverside', tone: 'info',
    match: ['음수대', '식수대', '급수대'] },
  { key: 'toilet',  label: '화장실',         icon: 'home',      tone: 'info',
    match: ['화장실'] },
  { key: 'shade',   label: '그늘·쉼터',      icon: 'rest',      tone: 'info',
    match: ['파고라', '퍼걸러', '정자', '쉼터', '벤치', '그늘막'] },
  { key: 'parking', label: '주차 가능',      icon: 'navigate',  tone: 'info',
    match: ['주차장'] },
  { key: 'cctv',    label: 'CCTV',           icon: 'shield',   tone: 'info',
    match: ['CCTV', '방범'] },
  { key: 'play',    label: '놀이터 인접',    icon: 'warning',  tone: 'caution',
    match: ['조합놀이대', '그네', '시소', '미끄럼틀', '놀이터', '유희시설', '흔들의자'] },
  { key: 'sports',  label: '운동장 인접',    icon: 'warning',  tone: 'caution',
    match: ['농구장', '축구장', '배드민턴장', '족구장', '게이트볼장', '테니스장',
            '다목적운동장', '운동장'] },
  { key: 'water_play', label: '물놀이 시설', icon: 'warning',  tone: 'caution',
    match: ['바닥분수', '분수', '물놀이'] },
];

/**
 * 원본 시설명 배열 → 견주용 칩 목록.
 * 같은 그룹에 여러 시설이 걸려도 칩은 하나만 만든다(칩 도배 방지).
 */
export function facilityChips(tags?: string[] | null): FacilityChip[] {
  if (!tags || tags.length === 0) return [];
  const out: FacilityChip[] = [];
  for (const g of GROUPS) {
    const hit = tags.some(t => g.match.some(m => t.includes(m)));
    if (hit) out.push({ key: g.key, label: g.label, icon: g.icon, tone: g.tone });
  }
  return out;
}
