/**
 * SHEETS: convention = a route in the root Stack presented as a native form sheet (detents, grabber, swipe down).
 *
 *   1. Make the screen file, e.g. app/something.tsx, and render its content inside <SheetScaffold title="...">.
 *   2. Register it in app/_layout.tsx:  <Stack.Screen name="something" options={sheetOptions({ detents: [0.9] })} />
 *   3. Open it with router.push('/something') (params via the usual query string).
 *   4. Close it with router.back() (or the scaffold's X).
 * Do not build bottom sheets out of Modal/absolute views: native sheets give detents, gestures and a11y for free.
 * Detents: give ONE detent. A list is collapsed to its largest (see `multiDetent`): iOS lays the content out at the largest detent,
 * so a footer would sit below the screen edge at a smaller one. For 'fitToContents' sheets pass <SheetScaffold fit>.
 * Keyboard: SheetScaffold lifts itself (footer included) above the keyboard. Never wrap it in a KeyboardAvoidingView (double padding);
 * a sheet that must handle the keyboard itself passes avoidKeyboard={false}.
 * On web (screenshots) the sheet is shown as a plain modal screen, which is fine for checking layout.
 */
import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Text } from './Text';
import { radius, useTheme } from './theme';
import type { Colors } from './theme';

export interface SheetOptionsInput {
  /** Fractions of screen height (0..1), or 'fitToContents'. Default [1]. Give one value (see `multiDetent`). */
  detents?: number[] | 'fitToContents';
  /** Index of the detent it opens at (only with `multiDetent`). */
  initialDetent?: number;
  grabber?: boolean;
  /**
   * Keep several detents. Off by default: UIKit lays a form sheet's content out at the LARGEST detent and slides the sheet
   * down for the smaller ones, so a footer button (SheetScaffold `footer`) or the bottom of a form sits below the screen edge
   * (cut off, untappable) until the user drags the sheet up. We therefore collapse a list to its largest detent.
   * Only set this for a sheet whose whole content is a scroll view with nothing pinned to the bottom.
   */
  multiDetent?: boolean;
}

/** Options for <Stack.Screen options={sheetOptions(...)} />. `colors` is optional; pass `useTheme().colors` to paint the sheet. */
export function sheetOptions(input: SheetOptionsInput = {}, colors?: Colors) {
  const asked = input.detents ?? [1];
  const detents = Array.isArray(asked) && asked.length > 1 && !input.multiDetent ? [Math.max(...asked)] : asked;
  return {
    presentation: 'formSheet' as const,
    headerShown: false,
    gestureEnabled: true,
    animation: Platform.OS === 'android' ? ('slide_from_bottom' as const) : undefined,
    sheetAllowedDetents: detents,
    sheetInitialDetentIndex: Array.isArray(detents) && detents.length > 1 ? (input.initialDetent ?? 0) : 0,
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
  /** Set when the sheet is registered with detents 'fitToContents': the scaffold must not stretch with flex:1 (the sheet is measured from its content). */
  fit?: boolean;
  /**
   * Lift the whole sheet (footer included) above the keyboard (iOS padding; Android resizes the window itself). Default on.
   * Pass false only for a sheet that handles the keyboard itself; never wrap the scaffold in another KeyboardAvoidingView.
   */
  avoidKeyboard?: boolean;
}

/** True while the software keyboard is up (iOS reports it before the animation, so padding follows it). */
function useKeyboardUp(enabled: boolean): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return up;
}

/** Standard sheet chrome: title row with close button, padded body, safe-area footer slot, keyboard avoidance. */
export function SheetScaffold({ title, hideClose, children, footer, fit, avoidKeyboard = true }: SheetScaffoldProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardUp(avoidKeyboard);
  // Home-indicator room: under the footer, or under the body when there is no footer (nothing sits in the swipe-home zone).
  // While the keyboard is up the home indicator is covered, so only a small gap is kept.
  const bottomInset = kb ? 8 : Math.max(insets.bottom, 16);
  const flex = fit ? undefined : 1;
  const body = (
    <>
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
      <View style={{ flex, paddingHorizontal: 20, paddingBottom: footer ? 0 : bottomInset }}>{children}</View>
      {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottomInset }}>{footer}</View> : null}
    </>
  );
  if (!avoidKeyboard) return <View style={{ flex, backgroundColor: colors.bg }}>{body}</View>;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex, backgroundColor: colors.bg }}>
      {body}
    </KeyboardAvoidingView>
  );
}
