'use client';

// Small shared pieces: viewer zone, ticking clock, source badge, attendee chips, Join Meet button.
import { useEffect, useState } from 'react';
import { LuSparkles, LuVideo } from 'react-icons/lu';
import { FaWhatsapp } from 'react-icons/fa';
import { useAuth } from '@/contexts/AuthContext';
import type { Meeting } from '@/lib/meetings/types';
import { NnAvatar, NnButton, NnChip } from './nn';
import { attendeeInitials, attendeeLabel, joinState, safeTz, sourceMeta } from './view';

/** Viewer zone: users.timezone if valid, else the browser zone. */
export function useViewerTz(): string {
  const { userData } = useAuth();
  const stored = (userData as { timezone?: string } | null)?.timezone;
  // Only rendered after the auth gate (client side), so reading the browser zone in the initializer is safe.
  const [browser] = useState(() => (typeof window === 'undefined' ? 'UTC' : safeTz(Intl.DateTimeFormat().resolvedOptions().timeZone)));
  if (stored) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: stored }); return stored; } catch { /* fall through */ }
  }
  return browser;
}

/** Re-renders every 30 s while visible so NOW / Join Meet states move. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const id = setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [everyMs]);
  return now;
}

export function SourceBadge({ via }: { via: Meeting['createdVia'] }) {
  const { label, tone } = sourceMeta(via);
  const icon = via === 'claude-code' ? <LuSparkles size={14} /> : via === 'bot' ? <FaWhatsapp size={14} /> : undefined;
  return <NnChip size="sm" tone={tone === 'neutral' ? undefined : tone} icon={icon}>{label}</NnChip>;
}

export function AttendeeChips({ list }: { list: Meeting['attendees'] }) {
  if (!list.length) return null;
  const shown = list.slice(0, 3);
  return (
    <div className="nn-row" style={{ flexWrap: 'wrap' }}>
      {shown.map((a, i) => (
        <NnChip key={i} size="sm" icon={<NnAvatar text={attendeeInitials(a)} />}>{attendeeLabel(a)}</NnChip>
      ))}
      {list.length > 3 && <NnChip size="sm">+{list.length - 3}</NnChip>}
    </div>
  );
}

export function JoinButton({ m, now, size = 'sm', block, compact }: { m: Meeting; now: number; size?: 'sm' | 'lg'; block?: boolean; compact?: boolean }) {
  const s = joinState(m, now);
  if (s === 'none' || !m.meetUrl) return null;
  const url = m.meetUrl;
  return (
    <NnButton
      size={size}
      block={block}
      style={compact ? { padding: '0 12px', fontSize: 13, gap: 6 } : undefined}
      variant={s === 'later' ? 'secondary' : 'accent'}
      icon={<LuVideo size={size === 'lg' ? 20 : 16} />}
      onClick={(e) => { e.stopPropagation(); window.open(url, '_blank', 'noopener'); }}
    >
      Join Meet
    </NnButton>
  );
}
