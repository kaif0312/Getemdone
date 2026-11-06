'use client';

import { useState } from 'react';
import type { Meeting } from '@/lib/meetings/types';
import { NnAvatar, NnButton, NnChip, NnEmpty, NnSheet, useNnToast } from './nn';
import { JoinButton, SourceBadge, useNow } from './bits';
import { attendeeInitials, attendeeLabel, dayLabel, durationMin, fmtDuration, reminderLabel, timeLines, zoneCity } from './view';

function Row({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="nn-frow nn-frow--static">
      <span className="nn-caption nn-muted">{label}</span>
      <span className="nn-body-strong">{value}</span>
      {sub && <span className="nn-caption nn-muted">{sub}</span>}
    </div>
  );
}

export default function MeetingDetailSheet({ meeting, viewerTz, onClose, onCancel }: {
  meeting: Meeting | undefined; viewerTz: string; onClose: () => void; onCancel: (id: string) => Promise<void>;
}) {
  const toast = useNnToast();
  const now = useNow();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!meeting || meeting.status !== 'scheduled') {
    return (
      <NnSheet title="Meeting" onClose={onClose}>
        <NnEmpty pose="disappointed" compact title="That meeting is gone." action={<NnButton variant="secondary" onClick={onClose}>Back</NnButton>} />
      </NnSheet>
    );
  }
  const m = meeting;
  const { main, other } = timeLines(m, viewerTz);

  const doCancel = async () => {
    setBusy(true);
    try {
      await onCancel(m.id);
      toast(`Cancelled.${m.gcalEventId ? ' Google Calendar updated.' : ''}`, 'success');
      onClose();
    } catch {
      toast('Could not cancel. Try again.', 'error');
      setBusy(false);
    }
  };

  const footer = confirm ? (
    <>
      <NnButton variant="danger" block loading={busy} onClick={doCancel}>Yes, cancel it</NnButton>
      <NnButton variant="ghost" block disabled={busy} onClick={() => setConfirm(false)}>Keep it</NnButton>
    </>
  ) : (
    <NnButton variant="secondary" dangerText block onClick={() => setConfirm(true)}>Cancel meeting</NnButton>
  );

  return (
    <NnSheet title="Meeting" onClose={onClose} footer={footer}>
      <h3 className="nn-title nn-clamp3" style={{ wordBreak: 'break-word' }}>{m.title}</h3>
      <div className="nn-row" style={{ flexWrap: 'wrap' }}>
        <SourceBadge via={m.createdVia} />
        <NnChip size="sm" tone="primary">{dayLabel(m.startAt, viewerTz, now)}</NnChip>
      </div>
      <div className="nn-group">
        <Row label="When" value={main} sub={other} />
        <Row label="Length" value={fmtDuration(durationMin(m))} />
        <Row label="Reminders" value={reminderLabel(m.reminderMinutes)} />
        <Row label="Time zone" value={zoneCity(m.tz)} />
      </div>
      <div className="nn-stack" style={{ gap: 8 }}>
        <p className="nn-label nn-muted">Who</p>
        {m.attendees?.length ? (
          m.attendees.map((a, i) => (
            <div key={i} className="nn-row" style={{ gap: 12 }}>
              <NnAvatar large text={attendeeInitials(a)} />
              <div style={{ minWidth: 0 }}>
                <p className="nn-body-strong nn-clamp1">{attendeeLabel(a)}</p>
                {a.email && a.name && <p className="nn-caption nn-muted nn-clamp1">{a.email}</p>}
              </div>
            </div>
          ))
        ) : (
          <p className="nn-caption nn-muted">Just you.</p>
        )}
      </div>
      {m.notes && (
        <div className="nn-stack" style={{ gap: 8 }}>
          <p className="nn-label nn-muted">Notes</p>
          <p className="nn-body" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.notes}</p>
        </div>
      )}
      <JoinButton m={m} now={now} size="lg" block />
      {m.gcalLink && (
        <NnButton variant="ghost" block onClick={() => window.open(m.gcalLink, '_blank', 'noopener')}>Open in Google Calendar</NnButton>
      )}
    </NnSheet>
  );
}
