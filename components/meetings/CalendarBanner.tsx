'use client';

import { useEffect, useState } from 'react';
import { LuCalendar } from 'react-icons/lu';
import { useAuth } from '@/contexts/AuthContext';
import { getCalendarStatus } from './api';
import { NnButton, NnCard, NnIconTile } from './nn';

export type BannerKind = 'none' | 'connect' | 'reconnect';

/** Calendar status -> banner kind. A failing status call means no banner (never blocks the list). */
export function useMeetingsCalendar(): BannerKind {
  const { user } = useAuth();
  const uid = user?.uid;
  const [kind, setKind] = useState<BannerKind>('none');
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const run = () => {
      getCalendarStatus()
        .then((s) => { if (alive) setKind(s.google.needsReconnect ? 'reconnect' : s.googleAvailable && !s.google.connected ? 'connect' : 'none'); })
        .catch(() => { if (alive) setKind('none'); });
    };
    run();
    const onVis = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, [uid]);
  return kind;
}

// Web connect is blocked on the backend (Via 'web'); until then the CTA opens the coach chat with /sync.
const SYNC_URL = 'https://wa.me/96560091617?text=%2Fsync';

export default function CalendarBanner({ kind, onDismiss }: { kind: BannerKind; onDismiss?: () => void }) {
  if (kind === 'none') return null;
  return (
    <NnCard tone="sun" compact>
      <div className="nn-row" style={{ gap: 12 }}>
        <NnIconTile sun><LuCalendar size={20} /></NnIconTile>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="nn-subheading">{kind === 'reconnect' ? 'Google Calendar needs you to sign in again.' : 'Google Calendar is not connected.'}</p>
          <p className="nn-caption nn-muted">
            {kind === 'reconnect' ? 'Meetings stay in Nudge until you do.' : 'Meetings stay in Nudge: no Meet link, no invites.'} Or connect it in the Nudge app.
          </p>
        </div>
      </div>
      <div className="nn-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        {onDismiss && <NnButton variant="ghost" size="sm" onClick={onDismiss}>Not now</NnButton>}
        <NnButton variant="accent" size="sm" onClick={() => window.open(SYNC_URL, '_blank', 'noopener')}>Connect</NnButton>
      </div>
    </NnCard>
  );
}
