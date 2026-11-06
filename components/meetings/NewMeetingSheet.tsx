'use client';

import { useMemo, useState } from 'react';
import { LuChevronRight, LuX } from 'react-icons/lu';
import type { CalendarStatus, Meeting, MeetingAttendee } from '@/lib/meetings/types';
import { MeetingsApiError } from './api';
import { NnButton, NnChip, NnSheet, useNnToast } from './nn';
import {
  DEFAULT_DURATION, DEFAULT_REMINDERS, DURATIONS, EMAIL_RE, MAX_ATTENDEES, REMINDER_CHOICES,
  dayKeyAt, defaultStart, fmtDuration, reminderLabel, validateDraft, zoneChoices, zoneCity, dayLabel, wallToUtcMs,
} from './view';
import type { NewMeetingDraft } from './view';

type Open = 'date' | 'time' | 'length' | 'zone' | 'reminders' | null;

export default function NewMeetingSheet({ viewerTz, calendarConnected, dateParam, onClose, onCreate }: {
  viewerTz: string;
  /** false = Google Calendar not connected (caption changes). */
  calendarConnected: boolean;
  dateParam?: string | null;
  onClose: () => void;
  onCreate: (d: NewMeetingDraft) => Promise<{ meeting: Meeting; calendar: CalendarStatus }>;
}) {
  const toast = useNnToast();
  const start = useMemo(() => defaultStart(viewerTz), [viewerTz]);
  const [today] = useState(() => dayKeyAt(Date.now(), viewerTz));
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam >= today ? dateParam : start.date));
  const [time, setTime] = useState(start.time);
  const [dur, setDur] = useState(DEFAULT_DURATION);
  const [tz, setTz] = useState(viewerTz);
  const [reminders, setReminders] = useState<number[]>(DEFAULT_REMINDERS);
  const [people, setPeople] = useState<MeetingAttendee[]>([]);
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const draft: NewMeetingDraft = { title, date, time, durationMin: dur, tz, attendees: people, notes, reminderMinutes: reminders };
  const problem = validateDraft(draft);
  const dateIso = new Date(wallToUtcMs(date, time || '00:00', tz)).toISOString();
  const canAdd = (pName.trim() !== '' || (pEmail.trim() !== '' && EMAIL_RE.test(pEmail.trim()))) && (pEmail.trim() === '' || EMAIL_RE.test(pEmail.trim())) && people.length < MAX_ATTENDEES;
  const addPerson = () => {
    if (!canAdd) return;
    setPeople([...people, { name: pName.trim() || undefined, email: pEmail.trim() || undefined }]);
    setPName(''); setPEmail('');
  };
  const toggleReminder = (min: number) => setReminders((r) => (r.includes(min) ? r.filter((x) => x !== min) : [...r, min]));
  const zones = zoneChoices(viewerTz);
  if (!zones.includes(tz)) zones.push(tz);

  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true);
    try {
      const r = await onCreate(draft);
      if (r.calendar === 'ok') toast('Booked.', 'success');
      else if (r.calendar === 'not_connected') toast('Booked in Nudge. Connect Google Calendar for invites.', 'info');
      else toast('Booked in Nudge. Google Calendar failed, no invite went out.', 'error');
      onClose();
    } catch (e) {
      toast(e instanceof MeetingsApiError && e.status === 401 ? 'Please sign in again.' : 'Could not book it. Try again.', 'error');
      setBusy(false);
    }
  };

  const row = (id: Exclude<Open, null>, label: string, value: string) => (
    <button type="button" className="nn-frow" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
      <span className="nn-body-strong">{label}</span>
      <span className="nn-row nn-muted" style={{ gap: 6 }}>
        <span className="nn-body">{value}</span>
        <LuChevronRight size={18} style={{ transform: open === id ? 'rotate(90deg)' : undefined }} aria-hidden />
      </span>
    </button>
  );

  return (
    <NnSheet
      title="New meeting"
      onClose={onClose}
      footer={
        <>
          <NnButton size="lg" block loading={busy} onClick={submit}>Book it</NnButton>
          {tried && problem && <p className="nn-caption nn-danger-text" role="alert" style={{ textAlign: 'center' }}>{problem}</p>}
        </>
      }
    >
      <input className="nn-field" value={title} maxLength={120} placeholder="What is it about?" aria-label="Title" onChange={(e) => setTitle(e.target.value)} />

      <div className="nn-group">
        {row('date', 'Date', dayLabel(dateIso, tz))}
        {open === 'date' && (
          <div className="nn-fbody"><input className="nn-field" type="date" min={today} value={date} aria-label="Date" onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        )}
        {row('time', 'Time', time)}
        {open === 'time' && (
          <div className="nn-fbody"><input className="nn-field" type="time" step={300} value={time} aria-label="Time" onChange={(e) => e.target.value && setTime(e.target.value)} /></div>
        )}
        {row('length', 'Length', fmtDuration(dur))}
        {open === 'length' && (
          <div className="nn-fbody">{DURATIONS.map((d) => <NnChip key={d} selected={d === dur} onClick={() => setDur(d)}>{fmtDuration(d)}</NnChip>)}</div>
        )}
        {row('zone', 'Time zone', zoneCity(tz))}
        {open === 'zone' && (
          <div className="nn-fbody">{zones.map((z) => <NnChip key={z} selected={z === tz} onClick={() => setTz(z)}>{zoneCity(z)}</NnChip>)}</div>
        )}
        {row('reminders', 'Reminders', reminderLabel(reminders))}
        {open === 'reminders' && (
          <div className="nn-fbody">{REMINDER_CHOICES.map((c) => <NnChip key={c.min} selected={reminders.includes(c.min)} onClick={() => toggleReminder(c.min)}>{c.label}</NnChip>)}</div>
        )}
      </div>

      <div className="nn-stack" style={{ gap: 8 }}>
        <p className="nn-label nn-muted">Who</p>
        {people.length > 0 && (
          <div className="nn-row" style={{ flexWrap: 'wrap' }}>
            {people.map((p, i) => (
              <NnChip key={i} size="sm" tone="primary" onClick={() => setPeople(people.filter((_, j) => j !== i))} label={`Remove ${p.name || p.email}`} icon={<LuX size={14} />}>{p.name || p.email}</NnChip>
            ))}
          </div>
        )}
        <div className="nn-row" style={{ alignItems: 'flex-start' }}>
          <input className="nn-field" value={pName} placeholder="Name" aria-label="Name" onChange={(e) => setPName(e.target.value)} />
          <input className="nn-field" type="email" inputMode="email" value={pEmail} placeholder="Email" aria-label="Email" onChange={(e) => setPEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }} />
        </div>
        <div><NnButton variant="secondary" size="sm" disabled={!canAdd} onClick={addPerson}>Add</NnButton></div>
      </div>

      <textarea className="nn-field" rows={4} value={notes} placeholder="Notes" aria-label="Notes" onChange={(e) => setNotes(e.target.value)} />
      <p className="nn-caption nn-muted">
        {calendarConnected ? 'Google Calendar sends the invite and the Meet link.' : 'Google Calendar is not connected: no invite, no Meet link.'}
      </p>
    </NnSheet>
  );
}

