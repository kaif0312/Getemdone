/**
 * Settings building blocks: grouped inset list (Group + Row), animated Switch, icon tiles, sub-page chrome (SettingsPage).
 */
import React, { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic, Icon, springs, Text, useReduceMotion, useTheme, type IconName } from '@/ui';

export type Tone = 'primary' | 'accent' | 'success' | 'sun' | 'danger' | 'neutral';

export function toneFill(tone: Tone, c: ReturnType<typeof useTheme>['colors']): string {
  return { primary: c.primary, accent: c.accent, success: c.success, sun: c.sunEdge, danger: c.danger, neutral: c.textMuted }[tone];
}

/** Rounded colour tile with a white icon, like iOS Settings. */
export function IconTile({ icon, tone = 'primary', size = 34 }: { icon: IconName; tone?: Tone; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: toneFill(tone, colors), alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.56} color={colors.onFill} strokeWidth={2.3} />
    </View>
  );
}

const W = 52;
const H = 32;

/** Animated switch: knob springs, track fades between border and success/primary. */
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? withTiming(value ? 1 : 0, { duration: 80 }) : withSpring(value ? 1 : 0, springs.bounce);
  }, [value, reduce, p]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [colors.border, colors.success]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + p.value * (W - H) }, { scale: 1 }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        haptic.select();
        onValueChange(!value);
      }}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={[{ width: W, height: H, borderRadius: H / 2, justifyContent: 'center' }, track]}>
        <Animated.View
          style={[
            { width: H - 6, height: H - 6, borderRadius: (H - 6) / 2, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

export interface RowProps {
  icon?: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  /** Right-aligned muted value text. */
  value?: string;
  onPress?: () => void;
  /** Custom right side (Switch, etc.). Replaces the chevron. */
  right?: React.ReactNode;
  destructive?: boolean;
  /** Hide the chevron on pressable rows. */
  noChevron?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** One list row, 56pt min, tactile press. */
export function Row({ icon, tone = 'primary', title, subtitle, value, onPress, right, destructive, noChevron, disabled, testID }: RowProps) {
  const { colors } = useTheme();
  const s = useSharedValue(0);
  const press = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(s.value, [0, 1], ['transparent', colors.surfaceAlt]) }));
  const t: Tone = destructive ? 'danger' : tone;
  const body = (
    <Animated.View style={[{ minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, press]}>
      {icon ? <IconTile icon={icon} tone={t} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={destructive ? 'danger' : 'default'} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="muted" numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text variant="caption" tone="muted" numberOfLines={1} style={{ maxWidth: 140 }}>{value}</Text> : null}
      {right ?? (onPress && !noChevron ? <Icon name="chevronRight" size={18} color={colors.textFaint} /> : null)}
    </Animated.View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={disabled}
      onPressIn={() => {
        haptic.select();
        s.value = withTiming(1, { duration: 70 });
      }}
      onPressOut={() => (s.value = withTiming(0, { duration: 160 }))}
      onPress={onPress}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {body}
    </Pressable>
  );
}

export function SwitchRow({ icon, tone, title, subtitle, value, onValueChange, disabled }: { icon?: IconName; tone?: Tone; title: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row
      icon={icon}
      tone={tone}
      title={title}
      subtitle={subtitle}
      right={<Switch value={value} onValueChange={onValueChange} disabled={disabled} accessibilityLabel={title} />}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      noChevron
    />
  );
}

/** Radio-style row (selected shows a check). */
export function OptionRow({ title, subtitle, selected, onPress, icon, tone }: { title: string; subtitle?: string; selected: boolean; onPress: () => void; icon?: IconName; tone?: Tone }) {
  const { colors } = useTheme();
  return (
    <Row
      icon={icon}
      tone={tone}
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      noChevron
      right={
        <View
          style={{
            width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {selected ? <Icon name="check" size={14} color={colors.onFill} strokeWidth={3.5} /> : null}
        </View>
      }
    />
  );
}

/** Inset rounded group with hairlines between children. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text variant="label" tone="muted" style={{ paddingHorizontal: 6 }}>{title}</Text> : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <View key={i} style={{ borderTopWidth: i ? 2 : 0, borderTopColor: colors.surfaceAlt }}>{c}</View>
        ))}
      </View>
      {footer ? <Text variant="caption" tone="faint" style={{ paddingHorizontal: 6 }}>{footer}</Text> : null}
    </View>
  );
}

/** Chrome for a Me sub-page: back button + title + scrolling body. */
export function SettingsPage({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => {
            haptic.select();
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>{title}</Text>
          {subtitle ? <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 20 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
