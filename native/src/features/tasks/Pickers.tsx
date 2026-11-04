/**
 * Inline pickers shared by the Add sheet and the task detail: month calendar, time, tags, plus Stepper and Cell primitives.
 * They render inside the sheet (no nested modals), controlled by their parent.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { Chip, haptic, Icon, radius, Text, useTheme } from '@/ui';
import { fmtTime, MONTH_LONG, monthGrid, ymd, TAG_CHOICES, tagDisplay, sameTag } from './helpers';

// ---- primitives ---------------------------------------------------------------------------------------------------
export function Cell({ label, selected, onPress, flex = 1, height = 44, muted }: {
  label: string; selected?: boolean; onPress: () => void; flex?: number; height?: number; muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={{
        flex, height, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
        backgroundColor: selected ? colors.primary : colors.surfaceAlt,
      }}
    >
      <Text variant="bodyStrong" style={{ color: selected ? colors.onFill : muted ? colors.textFaint : colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (n: number) => void; suffix?: string }) {
  const { colors } = useTheme();
  const btn = (label: string, delta: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? 'More' : 'Less'}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onChange(Math.max(min, Math.min(max, value + delta)));
      }}
      style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Text variant="heading">{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn('-', -1, value <= min)}
      <Text variant="heading" style={{ minWidth: 28, textAlign: 'center' }}>{value}</Text>
      {btn('+', 1, value >= max)}
      {suffix ? <Text tone="muted">{suffix}</Text> : null}
    </View>
  );
}

// ---- calendar -----------------------------------------------------------------------------------------------------
export function DatePickerPanel({ value, today, onChange, minDate }: { value: string | null; today: string; onChange: (d: string) => void; minDate?: string }) {
  const { colors } = useTheme();
  const base = value ?? today;
  const [year, setYear] = useState(Number(base.slice(0, 4)));
  const [month, setMonth] = useState(Number(base.slice(5, 7)) - 1);
  const { lead, days } = useMemo(() => monthGrid(year, month), [year, month]);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  const step = (n: number) => {
    const d = new Date(Date.UTC(year, month + n, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityLabel="Previous month" onPress={() => step(-1)} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevronLeft" size={22} color={colors.textMuted} />
        </Pressable>
        <Text variant="subheading" style={{ flex: 1, textAlign: 'center' }}>{MONTH_LONG[month]} {year}</Text>
        <Pressable accessibilityLabel="Next month" onPress={() => step(1)} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevronRight" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} variant="label" tone="faint" style={{ flex: 1, textAlign: 'center' }}>{d}</Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((d, i) => {
            if (!d) return <View key={i} style={{ flex: 1, height: 42 }} />;
            const date = ymd(year, month, d);
            const sel = date === value;
            const isToday = date === today;
            const disabled = !!minDate && date < minDate;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={date}
                accessibilityState={{ selected: sel, disabled }}
                disabled={disabled}
                onPress={() => {
                  haptic.select();
                  onChange(date);
                }}
                style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: sel ? colors.primary : 'transparent', borderWidth: isToday && !sel ? 2 : 0, borderColor: colors.primary,
                  }}
                >
                  <Text variant="bodyStrong" style={{ color: sel ? colors.onFill : disabled ? colors.textFaint : colors.text }}>{d}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---- time ---------------------------------------------------------------------------------------------------------
export function TimePickerPanel({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const { colors } = useTheme();
  const [h, m] = value.split(':').map(Number);
  const pm = h >= 12;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const set = (nh12: number, nm: number, npm: boolean) => {
    const hh = (nh12 % 12) + (npm ? 12 : 0);
    onChange(`${String(hh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);
  };
  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const grid = (items: number[], sel: number, onPick: (n: number) => void, pad: boolean) =>
    [0, 1].map((r) => (
      <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
        {items.slice(r * 6, r * 6 + 6).map((n) => (
          <Cell key={n} label={pad ? String(n).padStart(2, '0') : String(n)} selected={n === sel} onPress={() => onPick(n)} height={42} />
        ))}
      </View>
    ));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title" style={{ color: colors.primary }}>{fmtTime(value)}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="AM" selected={!pm} onPress={() => set(h12, m, false)} />
          <Chip label="PM" selected={pm} onPress={() => set(h12, m, true)} />
        </View>
      </View>
      <Text variant="label" tone="faint">Hour</Text>
      <View style={{ gap: 6 }}>{grid(hours, h12, (n) => set(n, m, pm), false)}</View>
      <Text variant="label" tone="faint">Minute</Text>
      <View style={{ gap: 6 }}>{grid(mins, m - (m % 5), (n) => set(h12, n, pm), true)}</View>
    </View>
  );
}

// ---- tags ---------------------------------------------------------------------------------------------------------
export const MAX_TAGS = 5;

export function TagPickerPanel({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { profile, updateProfile } = useAuth();
  const recent = (profile?.recentlyUsedTags ?? []).slice(0, 8);
  const toggle = (id: string) => {
    const has = value.some((t) => sameTag(t, id));
    let next: string[];
    if (has) next = value.filter((t) => !sameTag(t, id));
    else {
      if (value.length >= MAX_TAGS) {
        haptic.warning();
        return;
      }
      next = [...value, id];
      const rec = [id, ...(profile?.recentlyUsedTags ?? []).filter((t) => !sameTag(t, id))].slice(0, 12);
      void updateProfile({ recentlyUsedTags: rec }).catch(() => {});
    }
    onChange(next);
  };
  const chip = (id: string, key: string) => {
    const d = tagDisplay(id);
    return <Chip key={key} emoji={d.emoji} label={d.label} selected={value.some((t) => sameTag(t, id))} onPress={() => toggle(id)} tone="primary" size="sm" />;
  };
  return (
    <View style={{ gap: 10 }}>
      {recent.length > 0 ? (
        <>
          <Text variant="label" tone="faint">Recent</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{recent.map((t, i) => chip(t, `r${i}`))}</View>
          <Text variant="label" tone="faint">All</Text>
        </>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{TAG_CHOICES.map((t) => chip(t.id, t.id))}</View>
      <Text variant="caption" tone="faint">Up to {MAX_TAGS} tags.</Text>
    </View>
  );
}
