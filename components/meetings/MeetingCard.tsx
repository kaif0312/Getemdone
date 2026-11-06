'use client';

import { LuClock, LuGlobe } from 'react-icons/lu';
import type { Meeting } from '@/lib/meetings/types';
import { NnCard } from './nn';
import { AttendeeChips, JoinButton, SourceBadge } from './bits';
import { dayLabel, durationMin, fmtDuration, joinState, timeLines } from './view';

export default function MeetingCard({ m, viewerTz, now, first, showDay, onOpen }: {
  m: Meeting; viewerTz: string; now: number; first?: boolean; showDay?: boolean; onOpen: () => void;
}) {
  const live = joinState({ ...m, meetUrl: m.meetUrl ?? 'x' }, now) === 'live';
  const tone = live ? 'accent' : first ? 'primary' : undefined;
  const { main, other } = timeLines(m, viewerTz);
  const hasJoin = joinState(m, now) !== 'none';
  return (
    <NnCard tone={tone} compact onClick={onOpen} label={m.title}>
      <div className="nn-stack" style={{ gap: 8 }}>
        <div className="nn-row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h3 className="nn-subheading nn-clamp2" style={{ minWidth: 0, wordBreak: 'break-word' }}>{m.title}</h3>
          <SourceBadge via={m.createdVia} />
        </div>
        <div className="nn-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <LuClock size={14} aria-hidden />
          <span className="nn-body-strong">{showDay ? `${dayLabel(m.startAt, viewerTz, now)} · ` : ''}{main}</span>
          <span className="nn-caption nn-muted">· {fmtDuration(durationMin(m))}</span>
        </div>
        {other && (
          <div className="nn-row nn-faint" style={{ gap: 6 }}>
            <LuGlobe size={14} aria-hidden />
            <span className="nn-caption">{other}</span>
          </div>
        )}
        <AttendeeChips list={m.attendees ?? []} />
        {hasJoin && <div><JoinButton m={m} now={now} /></div>}
      </div>
    </NnCard>
  );
}
