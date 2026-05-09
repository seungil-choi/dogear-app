/**
 * 권한 안내 화면 (강아지 등록 직후, 홈 진입 직전)
 *
 * 위치 + 알림 권한을 명시적으로 요청.
 *  - OS 권한이라 약관 동의(consent)와 별개로 받음
 *  - 거부해도 서비스는 사용 가능 (단, 핵심 가치 떨어진다는 안내)
 *  - "나중에 허용"하는 사용자도 있으므로 skip 허용
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Colors, Typography, Spacing, Radius } from '../../src/constants/tokens';
import { Icon, type IconName } from '../../src/components/common/Icon';
import { useAppStore } from '../../src/store/useAppStore';

type PermStatus = 'pending' | 'granted' | 'denied';

interface PermItem {
  key: 'location' | 'notification';
  icon: IconName;
  title: string;
  desc: string;
  why: string;
}

const ITEMS: PermItem[] = [
  {
    key: 'location',
    icon: 'location-filled',
    title: '위치 권한',
    desc: '내 위치 주변 산책 장소를 추천해요.',
    why: '거부해도 지도에서 직접 지역을 옮겨 사용할 수 있어요.',
  },
  {
    key: 'notification',
    icon: 'bell',
    title: '알림 권한',
    desc: '발도장과 익숙한 강아지 알림을 받아요.',
    why: '거부해도 앱 안에서 모든 활동을 확인할 수 있어요.',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const setCurrentLocation = useAppStore(s => s.setCurrentLocation);

  const [statuses, setStatuses] = useState<Record<string, PermStatus>>({
    location: 'pending', notification: 'pending',
  });
  const [busy, setBusy] = useState<string | null>(null);

  const requestLocation = async () => {
    setBusy('location');
    try {
      // 웹: 권한 요청은 navigator.geolocation
      if (Platform.OS === 'web') {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setStatuses(s => ({ ...s, location: 'denied' }));
          return;
        }
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setCurrentLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
              setStatuses(s => ({ ...s, location: 'granted' }));
              resolve();
            },
            () => {
              setStatuses(s => ({ ...s, location: 'denied' }));
              resolve();
            },
            { timeout: 8000 },
          );
        });
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCurrentLocation({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy ?? undefined,
        });
        setStatuses(s => ({ ...s, location: 'granted' }));
      } else {
        setStatuses(s => ({ ...s, location: 'denied' }));
      }
    } catch {
      setStatuses(s => ({ ...s, location: 'denied' }));
    } finally {
      setBusy(null);
    }
  };

  const requestNotification = async () => {
    setBusy('notification');
    try {
      if (Platform.OS === 'web') {
        // 웹: Notification API
        if (typeof window === 'undefined' || !('Notification' in window)) {
          setStatuses(s => ({ ...s, notification: 'denied' }));
          return;
        }
        const result = await window.Notification.requestPermission();
        setStatuses(s => ({ ...s, notification: result === 'granted' ? 'granted' : 'denied' }));
        return;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      setStatuses(s => ({ ...s, notification: status === 'granted' ? 'granted' : 'denied' }));
    } catch {
      setStatuses(s => ({ ...s, notification: 'denied' }));
    } finally {
      setBusy(null);
    }
  };

  const handleAction = (key: string) => {
    if (key === 'location') requestLocation();
    else if (key === 'notification') requestNotification();
  };

  const proceed = () => router.replace('/(tabs)');

  const allDecided = ITEMS.every(it => statuses[it.key] !== 'pending');

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={s.title}>한 가지만 더 알려드릴게요</Text>
        <Text style={s.subtitle}>
          DogEar를 더 잘 쓰려면 두 가지 권한이 필요해요.{'\n'}
          나중에 설정에서 언제든 변경할 수 있어요.
        </Text>

        {ITEMS.map(item => {
          const st = statuses[item.key];
          return (
            <View key={item.key} style={s.permCard}>
              <View style={s.permHeader}>
                <View style={s.permIconWrap}>
                  <Icon name={item.icon} size={22} color={Colors.brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.permTitle}>{item.title}</Text>
                  <Text style={s.permDesc}>{item.desc}</Text>
                </View>
                {st === 'granted' && (
                  <View style={s.statusOk}>
                    <Icon name="check" size={14} color={Colors.brand.primary} />
                  </View>
                )}
              </View>
              <Text style={s.permWhy}>{item.why}</Text>
              {st === 'pending' ? (
                <TouchableOpacity
                  style={s.permBtn}
                  onPress={() => handleAction(item.key)}
                  disabled={busy !== null}
                  activeOpacity={0.85}
                >
                  <Text style={s.permBtnText}>
                    {busy === item.key ? '요청 중…' : '허용 요청하기'}
                  </Text>
                </TouchableOpacity>
              ) : st === 'granted' ? (
                <Text style={s.permResultOk}>허용됨 ✓</Text>
              ) : (
                <Text style={s.permResultSkip}>나중에 허용해도 괜찮아요</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, !allDecided && s.ctaSecondary]}
          onPress={proceed}
          activeOpacity={0.88}
        >
          <Text style={[s.ctaLabel, !allDecided && s.ctaLabelSecondary]}>
            {allDecided ? 'Dogear 시작하기' : '건너뛰고 시작하기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing[20], paddingBottom: 40 },

  title: { ...Typography.display.s, color: Colors.text.primary, marginBottom: Spacing[8] },
  subtitle: { ...Typography.body.m, color: Colors.text.secondary, lineHeight: 22, marginBottom: Spacing[28] },

  permCard: {
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.l,
    padding: Spacing[16],
    backgroundColor: Colors.surface.default,
    marginBottom: Spacing[14],
  },
  permHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[12], marginBottom: Spacing[8] },
  permIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  permTitle: { ...Typography.title.s, color: Colors.text.primary, fontWeight: '700' },
  permDesc:  { ...Typography.body.s, color: Colors.text.secondary, marginTop: 2 },
  permWhy:   { ...Typography.caption, color: Colors.text.tertiary, marginBottom: Spacing[12], lineHeight: 16 },

  statusOk: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.brand.subtle,
    borderWidth: 1.5, borderColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  permBtn: {
    height: 44,
    borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  permBtnText: { ...Typography.label.l, color: '#FFFFFF', fontWeight: '700' },
  permResultOk:   { ...Typography.label.s, color: Colors.brand.primary, fontWeight: '700', marginTop: 2 },
  permResultSkip: { ...Typography.label.s, color: Colors.text.tertiary, marginTop: 2 },

  footer: {
    paddingHorizontal: Spacing[20],
    paddingVertical: Spacing[16],
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.bg.primary,
  },
  cta: {
    height: 54, borderRadius: Radius.round,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaSecondary: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5, borderColor: Colors.border.default,
  },
  ctaLabel: { ...Typography.title.m, color: '#FFFFFF' },
  ctaLabelSecondary: { color: Colors.text.secondary },
});
