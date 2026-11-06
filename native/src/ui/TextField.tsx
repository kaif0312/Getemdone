import React, { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { fonts, radius, useTheme } from './theme';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

/** Chunky input: 56pt, thick border that turns purple on focus and red on error. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, error, hint, style, onFocus, onBlur, multiline, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.primary : colors.border;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="label" tone="muted">{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        accessibilityLabel={label}
        style={[
          {
            minHeight: multiline ? 96 : 56, paddingHorizontal: 16, paddingVertical: multiline ? 14 : 0, borderRadius: radius.lg,
            borderWidth: 2, borderColor: border, backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.bold, fontSize: 17,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
        ]}
        {...rest}
      />
      {error ? <Text variant="caption" tone="danger">{error}</Text> : hint ? <Text variant="caption" tone="faint">{hint}</Text> : null}
    </View>
  );
});
