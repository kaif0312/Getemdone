import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { haptic, springs } from './motion';
import { Text } from './Text';
import { useTheme } from './theme';

type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { icon: IconName; label: string }> = {
  today: { icon: 'today', label: 'Today' },
  friends: { icon: 'users', label: 'Friends' },
  progress: { icon: 'chart', label: 'Progress' },
  me: { icon: 'user', label: 'Me' },
};

function AddButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const s = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: s.value * 5 }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add task"
      onPressIn={() => {
        haptic.medium();
        s.value = withSpring(1, springs.press);
      }}
      onPressOut={() => (s.value = withSpring(0, springs.press))}
      onPress={onPress}
      style={{ width: 68, height: 68 + 5, marginTop: -26, alignItems: 'center' }}
    >
      <View style={{ position: 'absolute', top: 5, width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accentEdge }} />
      <Animated.View
        style={[
          { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bar },
          anim,
        ]}
      >
        <Icon name="plus" size={32} color="#fff" strokeWidth={3.4} />
      </Animated.View>
    </Pressable>
  );
}

function TabItem({ name, focused, onPress, onLongPress }: { name: string; focused: boolean; onPress: () => void; onLongPress: () => void }) {
  const { colors } = useTheme();
  const meta = ICONS[name] ?? { icon: 'today' as IconName, label: name };
  const pop = useSharedValue(focused ? 1 : 0);
  React.useEffect(() => {
    pop.value = withSpring(focused ? 1 : 0, springs.bounce);
  }, [focused, pop]);
  const pill = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.6 + pop.value * 0.4 }] }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -pop.value * 1 }] }));
  const color = focused ? colors.primary : colors.textFaint;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 64, gap: 2 }}
    >
      <Animated.View style={[{ width: 52, height: 32, alignItems: 'center', justifyContent: 'center' }, lift]}>
        <Animated.View style={[{ position: 'absolute', width: 52, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft }, pill]} />
        <Icon name={meta.icon} size={24} color={color} strokeWidth={focused ? 2.8 : 2.4} />
      </Animated.View>
      <Text variant="caption" style={{ color, fontFamily: focused ? 'Nunito_900Black' : 'Nunito_700Bold', fontSize: 11, lineHeight: 14 }}>
        {meta.label}
      </Text>
    </Pressable>
  );
}

/** 4 tabs + a raised centre Add button (opens /add, a form sheet). Pass as `tabBar` to expo-router <Tabs>. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routes = state.routes;
  const half = Math.ceil(routes.length / 2);

  const renderTab = (route: (typeof routes)[number], index: number) => {
    const focused = state.index === index;
    return (
      <TabItem
        key={route.key}
        name={route.name}
        focused={focused}
        onPress={() => {
          haptic.select();
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
      />
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bar, borderTopWidth: 2, borderTopColor: colors.border,
        paddingBottom: insets.bottom, paddingHorizontal: 8,
      }}
    >
      {routes.slice(0, half).map((r, i) => renderTab(r, i))}
      <View style={{ width: 84, alignItems: 'center' }}>
        <AddButton onPress={() => router.push('/add')} />
      </View>
      {routes.slice(half).map((r, i) => renderTab(r, i + half))}
    </View>
  );
}
