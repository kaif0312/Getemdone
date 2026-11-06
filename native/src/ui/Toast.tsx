import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { haptic, useReduceMotion } from './motion';
import { Text } from './Text';
import { radius, useTheme } from './theme';

export type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}
interface ToastApi {
  show: (message: string, opts?: { kind?: ToastKind; duration?: number }) => void;
}
const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Mount once near the root. One toast at a time, top of the screen, tap to dismiss, haptic by kind. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(1);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const reduce = useReduceMotion();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setItem(null);
  }, []);

  const show = useCallback<ToastApi['show']>((message, opts) => {
    const kind = opts?.kind ?? 'info';
    if (kind === 'success') haptic.success();
    else if (kind === 'error') haptic.error();
    if (timer.current) clearTimeout(timer.current);
    setItem({ id: idRef.current++, message, kind });
    timer.current = setTimeout(() => setItem(null), opts?.duration ?? 2800);
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  const tone = item?.kind === 'error' ? colors.danger : item?.kind === 'success' ? colors.success : colors.primary;
  const icon: IconName = item?.kind === 'error' ? 'x' : item?.kind === 'success' ? 'check' : 'bell';

  return (
    <ToastContext.Provider value={api}>
      {children}
      {item ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}>
          <Animated.View
            key={item.id}
            entering={reduce ? FadeIn : SlideInUp.springify().damping(16)}
            exiting={reduce ? FadeOut : SlideOutUp.duration(180)}
            style={{ alignSelf: 'stretch' }}
          >
            <Pressable
              onPress={dismiss}
              accessibilityRole="alert"
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 12, paddingRight: 18,
                borderRadius: radius.lg, borderWidth: 2, borderColor: tone, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 }, elevation: 8,
              }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={icon} size={18} color="#fff" strokeWidth={3} />
              </View>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{item.message}</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
