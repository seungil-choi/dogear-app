/**
 * 계정 제재 전용 안내 화면 (정책 18번 §8.1 "계정 제재 통지")
 *
 * 왜 별도 화면인가:
 *   제재된 사용자는 알림함에 들어갈 수 없다. 그런데 예전 동작은
 *   **Alert 한 번 띄우고 곧바로 로그아웃**시키는 것이었다.
 *   그러면 사유도 기간도 모르고, 무엇보다 **이의를 제기할 방법이 없다.**
 *   정책이 이걸 시행차단 항목으로 잡아둔 이유다(부록 C).
 *
 * 그래서 여기서는 세션을 끊지 않는다. 세션이 있어야
 * my_moderation_actions()를 읽고 submit_appeal()을 호출할 수 있다.
 * 대신 루트 레이아웃의 Stack.Protected가 앱 본체를 막는다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { Icon } from '../../src/components/common/Icon';
import { Button } from '../../src/components/common/Button';
import { supabase } from '../../src/lib/supabase';
import { useAppStore } from '../../src/store/useAppStore';
import { severSocialSessions } from '@/lib/socialSession';
import { toast } from '../../src/utils/toast';
import { confirm } from '../../src/utils/dialog';
import { SUPPORT_EMAIL } from '../../src/constants/messages';

/** my_moderation_actions() 한 행 */
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

function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 남은 이의기간 — "오늘까지"까지만 말하고 분 단위로 재촉하지 않는다 */
function daysLeft(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export default function AccountRestrictedScreen() {
  const router = useRouter();
  const logout = useAppStore(s => s.logout);

  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_moderation_actions');
    if (error) {
      // 조회가 실패해도 화면은 남는다 — 여기서 튕기면 이의 경로가 통째로 사라진다
      console.error('[account-restricted] 조치 조회 실패:', error.message);
      setActions([]);
    } else {
      setActions((data ?? []) as ModerationAction[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 계정 조치 중 가장 최근 것 — 이 화면의 주인공
  const accountAction = actions.find(a => a.target_type === 'account') ?? null;
  const appealable = accountAction?.can_appeal ?? false;
  const left = daysLeft(accountAction?.appeal_deadline_at);

  const submit = async () => {
    if (!accountAction || submitting) return;
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('submit_appeal', {
      p_action_id: accountAction.action_id,
      p_body: text,
    });
    setSubmitting(false);
    if (error) {
      // RPC가 한국어 사유를 그대로 준다(기한 만료·횟수 초과 등)
      toast.error(error.message || '이의를 접수하지 못했어요. 잠시 후 다시 시도해주세요');
      return;
    }
    setBody('');
    toast.success('이의를 접수했어요. 7영업일 안에 결과를 알려드릴게요');
    load();
  };

  const signOut = async () => {
    if (!(await confirm('다시 로그인하면 이 화면으로 돌아와요.', {
      title: '로그아웃할까요?', confirmText: '로그아웃',
    }))) return;
    try { await supabase.auth.signOut(); } catch { /* 세션 없음은 무시 */ }
    await severSocialSessions();
    logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.iconWrap}>
          <Icon name="lock" size={32} color={Colors.status.error.text} />
        </View>

        <Text style={s.title}>계정 이용이 제한됐어요</Text>
        <Text style={s.lead}>
          커뮤니티 가이드라인 위반이 확인되어 계정 이용을 제한하고 있어요.
          {'\n'}아래에서 사유를 확인하고, 동의하기 어려우시면 이의를 제기하실 수 있어요.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing[32] }} color={Colors.brand.primary} />
        ) : (
          <>
            {/* ── 사유 ── */}
            <View style={s.card}>
              <Text style={s.cardLabel}>제한 사유</Text>
              <Text style={s.cardBody}>
                {accountAction?.reason_note?.trim()
                  || '자세한 사유가 기록되지 않았어요. 고객센터로 문의해주시면 확인해 드릴게요.'}
              </Text>
              {!!accountAction?.notified_at && (
                <Text style={s.cardMeta}>통지일 {formatDate(accountAction.notified_at)}</Text>
              )}
            </View>

            {/* ── 이의제기 ── */}
            {accountAction?.appeal_status === 'pending' ? (
              <View style={s.card}>
                <Text style={s.cardLabel}>이의 심사 중</Text>
                <Text style={s.cardBody}>
                  접수된 이의를 검토하고 있어요. 결과는 7영업일 안에 이 화면에서 알려드릴게요.
                </Text>
              </View>
            ) : accountAction?.appeal_status === 'rejected' ? (
              <View style={s.card}>
                <Text style={s.cardLabel}>이의 검토 결과</Text>
                <Text style={s.cardBody}>
                  재검토했지만 조치를 유지하기로 했어요. 추가로 확인할 객관적인 자료가 있다면
                  고객센터로 보내주세요.
                </Text>
              </View>
            ) : appealable ? (
              <View style={s.card}>
                <Text style={s.cardLabel}>이의제기</Text>
                <Text style={s.cardHint}>
                  {left != null && left > 0
                    ? `${formatDate(accountAction?.appeal_deadline_at)}까지 신청하실 수 있어요 (${left}일 남음).`
                    : '이의 신청 기간이 얼마 남지 않았어요.'}
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
                {/* 왜 눌리지 않는지 알려준다 */}
                {!body.trim() && <Text style={s.footerHint}>내용을 입력하면 접수할 수 있어요</Text>}
                <Button
                  label={submitting ? '접수 중…' : '이의 제기하기'}
                  onPress={submit}
                  variant="primary"
                  size="l"
                  fullWidth
                  disabled={!body.trim() || submitting}
                />
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.cardLabel}>이의제기</Text>
                <Text style={s.cardBody}>
                  {accountAction?.appeal_deadline_at
                    ? '이의 신청 기간이 지났어요. 추가로 확인이 필요하시면 고객센터로 문의해주세요.'
                    : '아직 이의를 접수할 수 없어요. 통지가 도착하면 여기에서 신청하실 수 있어요.'}
                </Text>
              </View>
            )}

            {/* ── 그 외 콘텐츠 조치 ── */}
            {actions.filter(a => a.target_type !== 'account').length > 0 && (
              <View style={s.card}>
                <Text style={s.cardLabel}>콘텐츠 조치 내역</Text>
                {actions.filter(a => a.target_type !== 'account').map(a => (
                  <Text key={a.action_id} style={s.listItem}>
                    · {formatDate(a.notified_at)} — {a.reason_note?.trim() || '가이드라인 위반'}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}

        <Text style={s.support} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
          고객센터 {SUPPORT_EMAIL}
        </Text>
        <Button label="로그아웃" onPress={signOut} variant="secondary" size="m" fullWidth />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  content: { padding: Spacing[20], paddingBottom: Spacing[40], gap: Spacing[12] },

  iconWrap: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.status.error.bg, marginTop: Spacing[24],
  },
  title: { ...Typography.title.l, color: Colors.text.primary, textAlign: 'center' },
  lead: {
    ...Typography.body.m, color: Colors.text.secondary,
    textAlign: 'center', lineHeight: 22, marginBottom: Spacing[8],
  },

  card: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.l,
    borderWidth: 1, borderColor: Colors.border.default,
    padding: Spacing[16], gap: Spacing[6],
  },
  cardLabel: { ...Typography.label.m, color: Colors.text.secondary },
  cardBody: { ...Typography.body.m, color: Colors.text.primary, lineHeight: 22 },
  cardHint: { ...Typography.caption, color: Colors.text.tertiary },
  cardMeta: { ...Typography.caption, color: Colors.text.tertiary, marginTop: Spacing[4] },
  listItem: { ...Typography.body.s, color: Colors.text.secondary, lineHeight: 20 },

  input: {
    ...Typography.body.m, color: Colors.text.primary,
    minHeight: 96, textAlignVertical: 'top',
    borderWidth: 1, borderColor: Colors.border.default, borderRadius: Radius.m,
    padding: Spacing[12], marginTop: Spacing[6],
  },
  counter: { ...Typography.caption, color: Colors.text.tertiary, alignSelf: 'flex-end' },
  footerHint: {
    ...Typography.caption, color: Colors.text.secondary,
    textAlign: 'center', marginBottom: Spacing[6],
  },

  support: {
    ...Typography.body.s, color: Colors.brand.primary,
    textAlign: 'center', marginTop: Spacing[8], marginBottom: Spacing[4],
  },
});
