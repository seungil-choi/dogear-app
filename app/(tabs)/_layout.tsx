import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Shadow } from '../../src/constants/tokens';
import { Icon, type IconName } from '../../src/components/common/Icon';

// 탭바 기본 크기 (여기에 safe-area inset.bottom을 더해 시스템 내비바와 겹침 방지)
const TAB_BAR_BASE_HEIGHT = 72;
const TAB_BAR_BASE_PADDING_BOTTOM = Spacing[10];

// ─── 탭 아이콘 컴포넌트 ───────────────────────────────────────
function TabIcon({
  icon,
  iconFocused,
  label,
  focused,
}: {
  icon: IconName;
  iconFocused: IconName;
  label: string;
  focused: boolean;
}) {
  return (
    <View
      style={s.tabItem}
      accessible
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
    >
      <Icon
        name={focused ? iconFocused : icon}
        size={22}
        color={focused ? Colors.brand.accent : Colors.text.tertiary}
      />
      <Text style={[s.tabLabel, focused ? s.labelFocused : s.labelDefault]}>
        {label}
      </Text>
    </View>
  );
}

// ─── 발도장 탭 CTA 버튼 ───────────────────────────────────────
function PawTabButton({ onPress, children, style }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[style, s.pawTabBtn]}
      activeOpacity={0.8}
      accessibilityLabel="발도장 찍기"
      accessibilityRole="button"
    >
      <View style={[s.pawBubble, Shadow.paw]}>
        <Icon name="paw-filled" size={22} color={Colors.brand.onPrimary} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // 시스템 내비게이션 바(safe area) 높이를 더해 탭바가 겹치지 않도록 함
        tabBarStyle: [
          s.tabBar,
          {
            height: TAB_BAR_BASE_HEIGHT + insets.bottom,
            paddingBottom: TAB_BAR_BASE_PADDING_BOTTOM + insets.bottom,
          },
        ],
        tabBarShowLabel: false,
        tabBarItemStyle: s.tabItem,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home" iconFocused="home-filled" label="홈" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: '탐색',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="map" iconFocused="map-filled" label="탐색" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="paw"
        options={{
          title: '발도장',
          tabBarButton: (props) => (
            <PawTabButton {...props} onPress={() => router.push('/paw-checkin')} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-spots"
        options={{
          title: '내 장소',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="bookmark" iconFocused="bookmark-filled" label="내 장소" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="person" iconFocused="person-filled" label="내 정보" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  // 탭 바 — rgba로 반투명 처리
  tabBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopColor: Colors.border.default,
    borderTopWidth: 1,
    height: TAB_BAR_BASE_HEIGHT,
    paddingTop: Spacing[12],
    paddingBottom: TAB_BAR_BASE_PADDING_BOTTOM,
  },

  // 탭 아이콘
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: Spacing[4],
  },
  tabLabel: { fontSize: 10, lineHeight: 14, fontWeight: '500' },
  labelDefault: { color: Colors.text.tertiary },
  labelFocused: { color: Colors.brand.accent, fontWeight: '600' },

  // 발도장 CTA — 중앙 float
  pawTabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing[6],
  },
  pawBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    borderWidth: 3,
    borderColor: Colors.bg.primary,
  },
});
