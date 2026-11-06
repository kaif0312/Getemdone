/**
 * SHEETS: convention = a route in the root Stack presented as a native form sheet (detents, grabber, swipe down).
 *
 *   1. Make the screen file, e.g. app/something.tsx, and render its content inside <SheetScaffold title="...">.
 *   2. Register it in app/_layout.tsx:  <Stack.Screen name="something" options={sheetOptions({ detents: [0.6, 1] })} />
 *   3. Open it with router.push('/something') (params via the usual query string).
 *   4. Close it with router.back() (or the scaffold's X).
 * Do not build bottom sheets out of Modal/absolute views: native sheets give detents, gestures and a11y for free.
 * On web (screenshots) the sheet is shown as a plain modal screen, which is fine for checking layout.
 */
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Text } from './Text';
import { radius, useTheme } from './theme';
import type { Colors } from './theme';

export interface SheetOptionsInput {
  /** Fractions of screen height (0..1), or 'fitToContents'. Default [0.55, 1]. */
  detents?: number[] | 'fitToContents';
  /** Index of the detent it opens at. */
  initialDetent?: number;
  grabber?: boolean;
}

/** Options for <Stack.Screen options={sheetOptions(...)} />. `colors` is optional; pass `useTheme().colors` to paint the sheet. */
export function sheetOptions(input: SheetOptionsInput = {}, colors?: Colors) {
  return {
    presentation: 'formSheet' as const,
    headerShown: false,
    gestureEnabled: true,
    animation: Platform.OS === 'android' ? ('slide_from_bottom' as const) : undefined,
    sheetAllowedDetents: input.detents ?? [0.55, 1],
    sheetInitialDetentIndex: input.initialDetent ?? 0,
    sheetGrabberVisible: input.grabber ?? true,
    sheetCornerRadius: 28,
    sheetExpandsWhenScrolledToEdge: true,
    contentStyle: colors ? { backgroundColor: colors.bg } : undefined,
  };
}

export interface SheetScaffoldProps {
  title?: string;
  /** Hide the X (e.g. when the sheet has its own Cancel/Done buttons). */
  hideClose?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Standard sheet chrome: title row with close button, padded body, safe-area footer slot. */
export function SheetScaffold({ title, hideClose, children, footer }: SheetScaffoldProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 22 : 18, paddingBottom: 8, minHeight: 56 }}>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
        {hideClose ? null : (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1, paddingHorizontal: 20 }}>{children}</View>
      {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}
