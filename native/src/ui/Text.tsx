import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { fonts, useTheme, type Colors } from './theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'number';
export type TextTone = 'default' | 'muted' | 'faint' | 'primary' | 'accent' | 'success' | 'danger' | 'onFill';

const variants: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.black, fontSize: 40, lineHeight: 46, letterSpacing: -0.5 },
  title: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26 },
  subheading: { fontFamily: fonts.extrabold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.extrabold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Big confident numbers (streaks, counts). Tabular so they do not jitter while counting up. */
  number: { fontFamily: fonts.black, fontSize: 56, lineHeight: 60, letterSpacing: -1, fontVariant: ['tabular-nums'] },
};

function toneColor(tone: TextTone, c: Colors): string {
  switch (tone) {
    case 'muted': return c.textMuted;
    case 'faint': return c.textFaint;
    case 'primary': return c.primary;
    case 'accent': return c.accent;
    case 'success': return c.success;
    case 'danger': return c.danger;
    case 'onFill': return c.onFill;
    default: return c.text;
  }
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[variants[variant], { color: toneColor(tone, colors) }, align ? { textAlign: align } : null, style]}
    />
  );
}
