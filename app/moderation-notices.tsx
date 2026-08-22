/**
 * 내 콘텐츠 조치 내역 + 이의제기 (정책 18번 §8.1·§8.3)
 *
 * 제재되지 않은 사용자의 이의 경로다.
 * (제재 사용자는 앱 본체에 못 들어오므로 `(auth)/account-restricted`가 같은 역할을 한다.)
 *
 * 알림함의 "콘텐츠 조치" 알림을 누르면 여기로 온다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Layout } from '../src/constants/tokens';
import { Icon } from '../src/components/common/Icon';
import { Button } from '../src/components/common/Button';
import { EmptyState } from '../src/components/common/EmptyState';
import { supabase } from '../src/lib/supabase';
import { toast } from '../src/utils/toast';

type ModerationAction = {
  action_id: string;
  target_type: string;
  action: string;
  reason_note: string | null;
  notified_at: string | null;
  appeal_deadline_at: string | null;
  status: string;
  appeal_status: 'pending' | 'upheld' | 'rejected' | null;
  can_appeal: boolean;
};

const TARGET_LABEL: Record<string, string> = {
  checkin_photo: '발도장 사진',
  checkin: '발도장',
  dog: '강아지 프로필',
  spot_suggestion: '장소 제안',
  edit_suggestion: '정보 수정 제안',
  account: '계정',
};

const ACTION_LABEL: Record<string, string> = {
  hidden: '숨김',
  deleted: '삭제',
  restored: '복구',
  warned: '경고',
};

function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function daysLeft(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export default function ModerationNoticesScreen() {
  const router = useRouter();
  // 알림에서 특정 조치를 지정해 들어오면 그 카드를 펼친 상태로 시작한다
  const params = useLocalSearchParams<{ actionId?: string }>();

  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [openId, setOpenId] = useState<string | null>(params.actionId ?? null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_moderation_actions');
    if (error) {
      console.error('[moderation-notices] 조회 실패:', error.message);
      toast.error('조치 내역을 불러오지 못했어요. 잠시 후 다시 시도해주세요');
    }
    setActions(((data ?? []) as ModerationAction[]).filter(a => a.target_type !== 'account'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (actionId: string) => {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('submit_appeal', { p_action_id: actionId, p_body: text });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || '이의를 접수하지 못했어요. 잠시 후 다시 시도해주세요');
      return;
    }
    setBody('');
    setOpenId(null);
    toast.success('이의를 접수했어요. 7영업일 안에 결과를 알려드릴게요');
    load();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="뒤로 가기">
          <Icon name="back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>콘텐츠 조치 내역</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing[40] }} color={Colors.brand.primary} />
      ) : actions.length === 0 ? (
        <EmptyState
          headline="조치된 콘텐츠가 없어요"
          description="가이드라인에 따라 조치된 내용이 있으면 여기에 표시돼요."
        />
      ) : (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {actions.map(a => {
            const left = daysLeft(a.appeal_deadline_at);
            const open = openId === a.action_id;
            return (
              <View key={a.action_id} style={s.card}>
                <Text style={s.cardTitle}>
                  {TARGET_LABEL[a.target_type] ?? '콘텐츠'} {ACTION_LABEL[a.action] ?? a.action}
                </Text>
                <Text style={s.cardMeta}>{formatDate(a.notified_at)} 통지</Text>
                <Text style={s.cardBody}>
                  {a.reason_note?.trim() || '커뮤니티 가이드라인에 맞지 않는 내용이 확인됐어요.'}
                </Text>

                {a.appeal_status === 'pending' ? (
                  <Text style={s.state}>이의를 검토하고 있어요. 7영업일 안에 알려드릴게요.</Text>
                ) : a.appeal_status === 'upheld' ? (
                  <Text style={s.state}>이의가 받아들여져 원래대로 되돌렸어요.</Text>
                ) : a.appeal_status === 'rejected' ? (
                  <Text style={s.state}>재검토했지만 조치를 유지하기로 했어요.</Text>
                ) : a.can_appeal ? (
                  open ? (
                    <>
                      <Text style={s.cardHint}>
                        {left != null && left > 0
                          ? `${formatDate(a.appeal_deadline_at)}까지 신청하실 수 있어요 (${left}일 남음).`
                          : '기간이 얼마 남지 않았어요.'}
                      </Text>
                      <TextInput
                        style={s.input}
                        value={body}
                        onChangeText={setBody}
                        placeholder="어떤 점이 사실과 다른지 알려주세요"
                        placeholderTextColor={Colors.text.tertiary}
                        multiline
                        maxLength={2000}
                        editable={!submitting}
                      />
                      <Text style={s.counter}>{body.length}/2000</Text>
                      {!body.trim() && <Text style={s.hintCenter}>내용을 입력하면 접수할 수 있어요</Text>}
                      <Button
                        label={submitting ? '접수 중…' : '이의 제기하기'}
                        onPress={() => submit(a.action_id)}
                        variant="primary"
                        size="m"
                        fullWidth
                        disabled={!body.trim() || submitting}
                      />
                    </>
                  ) : (
                    <Button
                      label={left != null && left > 0 ? `이의 제기 (${left}일 남음)` : '이의 제기'}
                      onPress={() => { setOpenId(a.action_id); setBody(''); }}
                      variant="secondary"
                      size="m"
                      fullWidth
                    />
                  )
                ) : (
                  <Text style={s.state}>이의 신청 기간이 지났어요.</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    height: Layout.headerHeight,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[16],
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.title.m, color: Colors.text.primary },

  content: { padding: Spacing[16], gap: Spacing[12] },
  card: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    borderWidth: 1, borderColor: Colors.border.default,
    padding: Spacing[16], gap: Spacing[6],
  },
  cardTitle: { ...Typography.title.s, color: Colors.text.primary },
  cardMeta: { ...Typography.caption, color: Colors.text.tertiary },
  cardBody: { ...Typography.body.m, color: Colors.text.secondary, lineHeight: 22, marginTop: Spacing[4] },
  cardHint: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[4] },
  state: { ...Typography.body.s, color: Colors.text.tertiary, marginTop: Spacing[6] },

  input: {
    ...Typography.body.m, color: Colors.text.primary,
    minHeight: 88, textAlignVertical: 'top',
    borderWidth: 1, borderColor: Colors.border.default, borderRadius: Radius.m,
    padding: Spacing[12], marginTop: Spacing[6],
  },
  counter: { ...Typography.caption, color: Colors.text.tertiary, alignSelf: 'flex-end' },
  hintCenter: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center', marginBottom: Spacing[6] },
});
