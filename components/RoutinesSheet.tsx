'use client';

// Settings -> Routines: things you do on a schedule (take isabgol at night). Each one sends a WhatsApp message at its time
// with a Done / Skip button (lib/server/routines.ts); you can also mark today's one done here. Talks to /api/routines.
import { useCallback, useEffect, useState } from 'react';
import { FaTimes, FaTrash, FaCheck } from 'react-icons/fa';
import { auth } from '@/lib/firebase';

interface RoutineRow {
  id: string;
  title: string;
  time: string;
  days: number[];
  today: 'none' | 'sent' | 'done' | 'skipped';
  runsToday: boolean;
  streak: number;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

async function call(method: string, body?: unknown, query = '') {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(`/api/routines${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `failed (${res.status})`);
  return res.json();
}

function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function daysText(days: number[]): string {
  if (!days.length) return 'Every day';
  const k = days.join(',');
  if (k === '1,2,3,4,5') return 'Weekdays';
  if (k === '0,6') return 'Weekends';
  return days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
}

export default function RoutinesSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<RoutineRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('22:00');
  const [days, setDays] = useState<number[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRows((await call('GET')).routines as RoutineRow[]);
      setError('');
    } catch {
      setError('Could not load routines. Try again.');
    }
  }, []);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'bad_time' ? 'Pick a valid time.' : m === 'no_title' ? 'Give it a name.' : m === 'too_many' ? 'You have 20 routines already.' : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => { setEditing('new'); setTitle(''); setTime('22:00'); setDays([]); };
  const startEdit = (r: RoutineRow) => { setEditing(r.id); setTitle(r.title); setTime(r.time); setDays(r.days); };
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const save = () =>
    run(async () => {
      if (editing === 'new') await call('POST', { title, time, days });
      else await call('PUT', { id: editing, title, time, days });
      setEditing(null);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Routines"
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h3 className="text-base font-semibold text-fg-primary">Routines</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-muted"
          >
            <FaTimes />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-fg-tertiary">
          Things you do on a schedule. At the time you get a WhatsApp message with a Done button. You can also set them by
          messaging Nudge: “remind me to take isabgol every night at 10”.
        </p>

        {error && <p className="px-4 pt-2 text-xs text-error">{error}</p>}

        {editing ? (
          <div className="px-4 py-4 space-y-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="e.g. Take isabgol"
              className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-surface-muted text-sm text-fg-primary"
            />
            <label className="flex items-center gap-3 text-sm text-fg-secondary">
              Time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="px-3 py-2 rounded-lg border border-border-subtle bg-surface-muted text-fg-primary"
              />
            </label>
            <div>
              <div className="text-xs text-fg-tertiary mb-2">{days.length ? daysText(days) : 'Every day (tap days to limit)'}</div>
              <div className="flex gap-2">
                {DAY_LABELS.map((l, d) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    aria-pressed={days.includes(d)}
                    className={`w-10 h-10 rounded-full border text-sm ${days.includes(d) ? 'bg-primary text-white border-primary' : 'border-border-subtle text-fg-secondary'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-fg-secondary">Cancel</button>
              <button onClick={save} disabled={busy || !title.trim()} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {rows === null && !error && <p className="px-4 py-6 text-sm text-fg-tertiary">Loading…</p>}
            {rows?.length === 0 && <p className="px-4 py-6 text-sm text-fg-tertiary">No routines yet.</p>}
            {rows?.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3 border-b border-border-subtle">
                <button onClick={() => startEdit(r)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-fg-primary truncate">{r.title}</div>
                  <div className="text-xs text-fg-tertiary">
                    {clock12(r.time)} · {daysText(r.days)}
                    {r.streak > 0 ? ` · 🔥 ${r.streak}` : ''}
                  </div>
                </button>
                {r.runsToday && r.today === 'done' ? (
                  <span className="text-xs text-success flex items-center gap-1"><FaCheck size={10} /> Done today</span>
                ) : r.runsToday && r.today !== 'skipped' ? (
                  <button
                    onClick={() => run(() => call('PATCH', { id: r.id, status: 'done' }))}
                    disabled={busy}
                    className="text-xs text-primary px-2 py-2 disabled:opacity-50"
                  >
                    Mark done
                  </button>
                ) : r.today === 'skipped' ? (
                  <span className="text-xs text-fg-tertiary">Skipped</span>
                ) : null}
                <button
                  onClick={() => run(() => call('DELETE', undefined, `?id=${encodeURIComponent(r.id)}`))}
                  disabled={busy}
                  aria-label={`Delete ${r.title}`}
                  className="w-10 h-10 flex items-center justify-center text-fg-tertiary hover:text-error disabled:opacity-50"
                >
                  <FaTrash size={13} />
                </button>
              </div>
            ))}
            <div className="px-4 py-3">
              <button onClick={startNew} className="text-sm text-primary">+ Add a routine</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
