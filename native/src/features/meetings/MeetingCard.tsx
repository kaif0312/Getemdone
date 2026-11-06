/** One meeting in the list (spec 2.2): title + source badge, time in the viewer's zone, other zone, people, Join Meet. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, haptic, Text } from '@/ui';
import type { Meeting } from '@/lib/meetingsTypes';
import { AttendeeChips } from './AttendeeChips';
import { SourceBadge } from './SourceBadge';
import { IconLine, openMeet } from './ui';
import { dayLabel, durationMin, fmtDuration, joinState, timeLines } from './view';

export function MeetingCard({ m, viewerTz, now, tone, showDay, onPress }: {
  m: Meeting; viewerTz: string; now: number; tone: 'surface' | 'primary' | 'accent'; showDay?: boolean; onPress: () => void;
}) {
  const t = timeLines(m, viewerTz);
  const join = joinState(m, now);
  return (
    <Card tone={tone} padding={14}>
      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${m.title}, ${t.main}`}
          onPress={() => { haptic.select(); onPress(); }}
          style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.7 : 1 })}
        >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text variant="subheading" numberOfLines={2} style={{ flex: 1 }}>{m.title}</Text>
          <SourceBadge via={m.createdVia} />
        </View>
        <IconLine icon="clock">
          <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
            {showDay ? `${dayLabel(m.startAt, viewerTz, now)} · ` : ''}{t.main}
          </Text>
          <Text variant="caption" tone="muted">· {fmtDuration(durationMin(m))}</Text>
        </IconLine>
        {t.other ? (
          <IconLine icon="globe"><Text variant="caption" tone="faint">{t.other}</Text></IconLine>
        ) : null}
        <AttendeeChips list={m.attendees} />
        </Pressable>
        {m.meetUrl && join !== 'none' ? (
          <View style={{ flexDirection: 'row' }}>
            <Button label="Join Meet" size="sm" icon="video" variant={join === 'later' ? 'secondary' : 'accent'} onPress={() => openMeet(m.meetUrl!)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
