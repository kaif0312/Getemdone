/**
 * Nudge theme: palette tokens (light + dark), type, spacing, radii. Spec: docs/NATIVE_APP_PLAN.md section 3.
 * Always read colours from `useTheme().colors`, never hard-code hex in screens.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export const brand = {
  purple: '#7B4FD6',
  purpleDark: '#5B34B0',
  orange: '#FF6A1F',
  orangeDark: '#D94E0A',
  sun: '#F7C04A',
  sunDark: '#D99A1E',
  ink: '#1E1433',
  cream: '#FFF8EC',
  green: '#2BB673',
  greenDark: '#1E8F58',
  red: '#E5484D',
  redDark: '#B8343A',
} as const;

export interface Colors {
  /** Screen background */
  bg: string;
  /** Cards, sheets, inputs */
  surface: string;
  /** Subtle fills (chips, skeletons, pressed rows) */
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Text on top of a filled primary/accent/success/danger background */
  onFill: string;

  primary: string;
  primaryEdge: string; // the 3D bottom edge
  primarySoft: string;
  accent: string;
  accentEdge: string;
  accentSoft: string;
  sun: string;
  sunEdge: string;
  sunSoft: string;
  success: string;
  successEdge: string;
  successSoft: string;
  danger: string;
  dangerEdge: string;
  dangerSoft: string;

  /** Tab bar / header translucent-free solid backgrounds */
  bar: string;
  overlay: string;
  shadow: string;
}

export const lightColors: Colors = {
  bg: brand.cream,
  surface: '#FFFFFF',
  surfaceAlt: '#F6EBD5',
  border: '#EADCC0',
  text: brand.ink,
  textMuted: '#6A5E85',
  textFaint: '#A398BD',
  onFill: '#FFFFFF',

  primary: brand.purple,
  primaryEdge: brand.purpleDark,
  primarySoft: '#EEE7FB',
  accent: brand.orange,
  accentEdge: brand.orangeDark,
  accentSoft: '#FFE8DA',
  sun: brand.sun,
  sunEdge: brand.sunDark,
  sunSoft: '#FFF0C9',
  success: brand.green,
  successEdge: brand.greenDark,
  successSoft: '#DDF5E8',
  danger: brand.red,
  dangerEdge: brand.redDark,
  dangerSoft: '#FFE3E4',

  bar: '#FFFFFF',
  overlay: 'rgba(30,20,51,0.45)',
  shadow: 'rgba(30,20,51,0.12)',
};

export const darkColors: Colors = {
  bg: '#140C24',
  surface: '#21163A',
  surfaceAlt: '#2D2050',
  border: '#3B2D63',
  text: brand.cream,
  textMuted: '#B7ABD3',
  textFaint: '#7F72A3',
  onFill: '#FFFFFF',

  primary: '#8C63E8',
  primaryEdge: '#5B34B0',
  primarySoft: '#32245C',
  accent: brand.orange,
  accentEdge: '#B7440A',
  accentSoft: '#442416',
  sun: brand.sun,
  sunEdge: '#B57F14',
  sunSoft: '#40331A',
  success: '#34C47F',
  successEdge: '#1A7A4B',
  successSoft: '#17382B',
  danger: '#F0585D',
  dangerEdge: '#9C2B30',
  dangerSoft: '#40191D',

  bar: '#1A1030',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: 'rgba(0,0,0,0.4)',
};

export const radius = { sm: 12, md: 16, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
/** Minimum touch target (points). */
export const HIT = 44;

/** Nunito weights loaded in the root layout (`useNunito`). */
export const fonts = {
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export type Scheme = 'light' | 'dark';

interface ThemeValue {
  scheme: Scheme;
  isDark: boolean;
  colors: Colors;
}

const ThemeContext = createContext<ThemeValue>({ scheme: 'light', isDark: false, colors: lightColors });

/** Wrap the app (follows the OS) or a subtree (pass `scheme` to force light/dark, used by the kit page). */
export function ThemeProvider({ scheme, children }: { scheme?: Scheme; children: React.ReactNode }) {
  const system = useColorScheme();
  const resolved: Scheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const value = useMemo<ThemeValue>(
    () => ({ scheme: resolved, isDark: resolved === 'dark', colors: resolved === 'dark' ? darkColors : lightColors }),
    [resolved],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
