/**
 * 공지사항 (planning/37)
 *
 * 쓰기는 어드민 RPC만 한다. 앱은 게시된 공지(status='published')만 읽는다 — RLS가 그렇게 막아 둔다.
 */
import { supabase } from './supabase';

export type NoticeCategory = 'policy' | 'service' | 'maintenance' | 'event';

export interface Notice {
  notice_id: string;
  category: NoticeCategory;
  title: string;
  body: string;
  link_path: string | null;
  link_label: string | null;
  is_pinned: boolean;
  published_at: string;
}

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  policy: '약관·정책',
  service: '서비스',
  maintenance: '점검',
  event: '이벤트',
};

const COLUMNS = 'notice_id, category, title, body, link_path, link_label, is_pinned, published_at';

/** 고정 공지 먼저, 그다음 게시일 최신순 */
export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select(COLUMNS)
    .eq('status', 'published')
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Notice[];
}

/** 내린 공지·없는 공지면 null (알림함에 남은 옛 알림에서 들어오는 경우) */
export async function fetchNotice(noticeId: string): Promise<Notice | null> {
  const { data, error } = await supabase
    .from('notices')
    .select(COLUMNS)
    .eq('notice_id', noticeId)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw error;
  return (data as Notice) ?? null;
}

/** 2026.10.16 */
export function noticeDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
