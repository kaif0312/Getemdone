import React from 'react';
import { RefreshControl, ScrollView, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

/** Height the custom tab bar occupies above the safe-area inset (scroll content needs this much bottom padding). */
export const TAB_BAR_HEIGHT = 72;

export interface ScreenProps {
  children: React.ReactNode;
  /** Rendered above the scroll area (usually <Header />). */
  header?: React.ReactNode;
  /** Wrap children in a ScrollView. Default true. */
  scroll?: boolean;
  /** Horizontal padding for content. Default 20. */
  padded?: boolean;
  /** Tab screens: leave room for the tab bar. Default true. Set false in sheets/stack screens. */
  tabs?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pass through for keyboard handling in forms. */
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}

/** Page container: themed background, optional header, pull-to-refresh scrolling, tab-bar and safe-area padding. */
export function Screen({
  children, header, scroll = true, padded = true, tabs = true, refreshing, onRefresh, gap = 16, contentStyle, keyboardShouldPersistTaps = 'handled',
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = tabs ? TAB_BAR_HEIGHT + insets.bottom + 24 : insets.bottom + 24;
  const refreshControl: React.ReactElement<RefreshControlProps> | undefined = onRefresh ? (
    <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
  ) : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      {scroll ? (
        <ScrollView
          refreshControl={refreshControl}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          contentContainerStyle={[{ paddingHorizontal: padded ? 20 : 0, paddingBottom: bottom, gap, flexGrow: 1 }, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingHorizontal: padded ? 20 : 0 }, contentStyle]}>{children}</View>
      )}
    </View>
  );
}
