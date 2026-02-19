/**
 * Design Token Architecture
 * All colors reference these tokens - no hardcoded hex/rgb/hsl in components.
 *
 * LIGHT MODE: Independently designed with warm neutrals
 * DARK MODE: Cool undertone neutrals (hue 220)
 */

export const tokens = {
  light: {
    // Background layers
    bgBase: 'hsl(220, 20%, 97%)',
    bgSurface: 'hsl(0, 0%, 100%)',
    bgElevated: 'hsl(0, 0%, 100%)',

    // Primary accent - primary actions only
    primary: 'hsl(220, 85%, 50%)',
    primaryMuted: 'hsl(220, 40%, 45%)',

    // Text
    textPrimary: 'hsl(220, 15%, 12%)',
    textSecondary: 'hsl(220, 10%, 40%)',
    textTertiary: 'hsl(220, 8%, 58%)',
    textDisabled: 'hsl(220, 8%, 70%)',

    // Borders
    borderSubtle: 'rgba(0, 0, 0, 0.06)',
    borderEmphasized: 'rgba(0, 0, 0, 0.12)',

    // Semantic
    success: 'hsl(145, 65%, 42%)',
    warning: 'hsl(35, 85%, 55%)',
    error: 'hsl(0, 72%, 51%)',

    // Card elevation (box-shadow instead of color)
    shadowCard: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  },
  dark: {
    // Background layers - cool undertone
    bgBase: 'hsl(220, 15%, 8%)',
    bgSurface: 'hsl(220, 13%, 12%)',
    bgElevated: 'hsl(220, 12%, 16%)',

    // Primary accent
    primary: 'hsl(220, 90%, 56%)',
    primaryMuted: 'hsl(220, 40%, 45%)',

    // Text
    textPrimary: 'rgba(255, 255, 255, 0.92)',
    textSecondary: 'rgba(255, 255, 255, 0.62)',
    textTertiary: 'rgba(255, 255, 255, 0.42)',
    textDisabled: 'rgba(255, 255, 255, 0.24)',

    // Borders
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    borderEmphasized: 'rgba(255, 255, 255, 0.14)',

    // Semantic
    success: 'hsl(145, 65%, 42%)',
    warning: 'hsl(35, 85%, 55%)',
    error: 'hsl(0, 72%, 51%)',

    shadowCard: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.15)',
  },
} as const;

/** Friend/avatar accent gradients - full Tailwind class names using CSS vars */
export const ACCENT_GRADIENTS: { from: string; to: string; text: string }[] = [
  { from: 'from-[var(--accent-1-from)]', to: 'to-[var(--accent-1-to)]', text: 'text-[var(--accent-1-text)]' },
  { from: 'from-[var(--accent-2-from)]', to: 'to-[var(--accent-2-to)]', text: 'text-[var(--accent-2-text)]' },
  { from: 'from-[var(--accent-3-from)]', to: 'to-[var(--accent-3-to)]', text: 'text-[var(--accent-3-text)]' },
  { from: 'from-[var(--accent-4-from)]', to: 'to-[var(--accent-4-to)]', text: 'text-[var(--accent-4-text)]' },
  { from: 'from-[var(--accent-5-from)]', to: 'to-[var(--accent-5-to)]', text: 'text-[var(--accent-5-text)]' },
  { from: 'from-[var(--accent-6-from)]', to: 'to-[var(--accent-6-to)]', text: 'text-[var(--accent-6-text)]' },
  { from: 'from-[var(--accent-7-from)]', to: 'to-[var(--accent-7-to)]', text: 'text-[var(--accent-7-text)]' },
  { from: 'from-[var(--accent-8-from)]', to: 'to-[var(--accent-8-to)]', text: 'text-[var(--accent-8-text)]' },
];

export function getAccentForId(id: string) {
  const index = id
    ? (id.charCodeAt(0) + (id.length > 1 ? id.charCodeAt(id.length - 1) : 0)) % ACCENT_GRADIENTS.length
    : 0;
  return ACCENT_GRADIENTS[index] ?? ACCENT_GRADIENTS[0];
}
