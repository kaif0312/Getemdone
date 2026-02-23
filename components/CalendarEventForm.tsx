'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaArrowLeft, FaChevronDown, FaCalendarDay } from 'react-icons/fa';
import { LuMapPin } from 'react-icons/lu';
import type { CalendarEvent, GoogleCalendarListItem, TaskVisibility } from '@/lib/types';
import VisibilityBottomSheet from './VisibilityBottomSheet';

const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26',
  '6': '#f4511e', '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

function getCalColor(colorId?: string, backgroundColor?: string): string {
  if (backgroundColor) return backgroundColor;
  return GOOGLE_CALENDAR_COLORS[colorId || '1'] || '#4285f4';
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_15 = [0, 15, 30, 45];
const AM_PM = ['AM', 'PM'];

function parseTime(dateTime?: string): { hour12: number; minute: number; ampm: 'AM' | 'PM' } {
  if (!dateTime || !dateTime.includes('T')) {
    return { hour12: 9, minute: 0, ampm: 'AM' };
  }
  const [, time] = dateTime.split('T');
  const [h, m] = (time?.slice(0, 5) || '09:00').split(':').map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'AM' : 'PM';
  const minute = MINUTES_15.includes(m) ? m : MINUTES_15.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
  return { hour12, minute, ampm };
}

function getTimezoneOffsetRFC3339(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const mins = Math.abs(offsetMinutes) % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function toDateTime(dateStr: string, hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  let h = hour12;
  if (ampm === 'PM' && hour12 !== 12) h += 12;
  if (ampm === 'AM' && hour12 === 12) h = 0;
  const tz = getTimezoneOffsetRFC3339();
  return `${dateStr}T${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${tz}`;
}

function toMinutes(hour12: number, minute: number, ampm: 'AM' | 'PM'): number {
  let h = hour12;
  if (ampm === 'PM' && hour12 !== 12) h += 12;
  if (ampm === 'AM' && hour12 === 12) h = 0;
  return h * 60 + minute;
}

interface CalendarEventFormProps {
  dateStr: string;
  calendars: GoogleCalendarListItem[];
  defaultCalendarId: string;
  defaultVisibility: TaskVisibility;
  defaultVisibilityList: string[];
  event?: CalendarEvent | null;
  onSave: (event: {
    calendarId: string;
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    visibility?: TaskVisibility;
    visibilityList?: string[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string, retry?: () => void) => void;
}

export default function CalendarEventForm({
  dateStr,
  calendars,
  defaultCalendarId,
  defaultVisibility,
  defaultVisibilityList,
  event,
  onSave,
  onDelete,
  onBack,
  onSuccess,
  onError,
}: CalendarEventFormProps) {
  const isEdit = !!event;
  const [localDateStr, setLocalDateStr] = useState(dateStr);
  const [title, setTitle] = useState(event?.summary || '');
  const [calendarId, setCalendarId] = useState(event?.calendarId || defaultCalendarId);
  const [allDay, setAllDay] = useState(!event?.start?.dateTime);
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [endHour12, setEndHour12] = useState(10);
  const [endMinute, setEndMinute] = useState(0);
  const [endAmpm, setEndAmpm] = useState<'AM' | 'PM'>('AM');
  const [location, setLocation] = useState(event?.location || '');
  const [description, setDescription] = useState(event?.description || '');
  const [visibility, setVisibility] = useState<TaskVisibility>(event?.visibility ?? defaultVisibility);
  const [visibilityList, setVisibilityList] = useState<string[]>(event?.visibilityList ?? defaultVisibilityList);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [titleShake, setTitleShake] = useState(false);
  const [titlePlaceholder, setTitlePlaceholder] = useState('Event name');
  const [endTimeError, setEndTimeError] = useState(false);

  useEffect(() => {
    setLocalDateStr(dateStr);
  }, [dateStr]);

  useEffect(() => {
    if (event) {
      setTitle(event.summary || '');
      setCalendarId(event.calendarId);
      const evDate = event.start?.date || event.start?.dateTime?.slice(0, 10);
      setLocalDateStr(evDate || dateStr);
      const hasTime = !!event.start?.dateTime;
      setAllDay(!hasTime);
      if (hasTime) {
        const start = parseTime(event.start.dateTime);
        const end = parseTime(event.end?.dateTime);
        setHour12(start.hour12);
        setMinute(start.minute);
        setAmpm(start.ampm);
        setEndHour12(end.hour12);
        setEndMinute(end.minute);
        setEndAmpm(end.ampm);
      }
      setLocation(event.location || '');
      setDescription(event.description || '');
      setVisibility(event.visibility ?? defaultVisibility);
      setVisibilityList(event.visibilityList ?? defaultVisibilityList);
    } else {
      setHour12(9);
      setMinute(0);
      setAmpm('AM');
      setEndHour12(10);
      setEndMinute(0);
      setEndAmpm('AM');
    }
  }, [event, defaultVisibility, defaultVisibilityList, dateStr]);

  const validateEndTime = useCallback(() => {
    if (allDay) {
      setEndTimeError(false);
      return true;
    }
    const startMins = toMinutes(hour12, minute, ampm);
    const endMins = toMinutes(endHour12, endMinute, endAmpm);
    if (endMins <= startMins) {
      setEndTimeError(true);
      const newEndMins = startMins + 60;
      const newH = Math.floor(newEndMins / 60) % 12 || 12;
      const newM = newEndMins % 60;
      const newAmpm = newEndMins >= 720 ? 'PM' : 'AM';
      setEndHour12(newH);
      setEndMinute(MINUTES_15.includes(newM) ? newM : MINUTES_15.reduce((a, b) => (Math.abs(b - newM) < Math.abs(a - newM) ? b : a)) as number);
      setEndAmpm(newAmpm);
      return false;
    }
    setEndTimeError(false);
    return true;
  }, [allDay, hour12, minute, ampm, endHour12, endMinute, endAmpm]);

  useEffect(() => {
    validateEndTime();
  }, [hour12, minute, ampm, endHour12, endMinute, endAmpm, allDay, validateEndTime]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setTitleError(true);
      setTitleShake(true);
      setTitlePlaceholder('Event name is required');
      setTimeout(() => {
        setTitleShake(false);
        setTitlePlaceholder('Event name');
      }, 2000);
      setTimeout(() => setTitleError(false), 2000);
      return;
    }
    if (!validateEndTime()) return;
    setSaving(true);
    setEndTimeError(false);
    try {
      const start = allDay ? { date: localDateStr } : { dateTime: toDateTime(localDateStr, hour12, minute, ampm) };
      const end = allDay
        ? { date: localDateStr }
        : { dateTime: toDateTime(localDateStr, endHour12, endMinute, endAmpm) };
      await onSave({
        calendarId,
        summary: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start,
        end,
        visibility,
        visibilityList,
      });
      onSuccess?.(isEdit ? 'Event updated' : 'Event created');
      onBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const fallback = isEdit ? "Couldn't update event. Try again." : "Couldn't create event. Try again.";
      onError?.(msg || fallback, () => handleSubmit());
    } finally {
      setSaving(false);
    }
  };

  const getVisibilityLabel = () => {
    if (visibility === 'everyone') return 'Everyone';
    if (visibility === 'private') return 'Private';
    if (visibility === 'only') return `Only ${visibilityList.length} friend${visibilityList.length !== 1 ? 's' : ''}`;
    return `Except ${visibilityList.length} friend${visibilityList.length !== 1 ? 's' : ''}`;
  };

  const selectClassName = 'min-w-[56px] h-11 rounded-lg border border-border-subtle bg-surface text-[14px] text-fg-primary px-2';
  const colonSpan = <span className="text-[14px] text-fg-secondary mx-2">:</span>;

  const TimeRow = ({ label, hour12, minute, ampm, onHour, onMinute, onAmpm }: {
    label: string;
    hour12: number;
    minute: number;
    ampm: 'AM' | 'PM';
    onHour: (v: number) => void;
    onMinute: (v: number) => void;
    onAmpm: (v: 'AM' | 'PM') => void;
  }) => (
    <div className="w-full">
      <p className="text-[12px] text-fg-tertiary mb-1.5 text-left">{label}</p>
      <div className="flex items-center">
        <select value={hour12} onChange={(e) => onHour(Number(e.target.value))} className={selectClassName}>
          {HOURS_12.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        {colonSpan}
        <select value={minute} onChange={(e) => onMinute(Number(e.target.value))} className={selectClassName}>
          {MINUTES_15.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
        </select>
        {colonSpan}
        <select value={ampm} onChange={(e) => onAmpm(e.target.value as 'AM' | 'PM')} className={selectClassName}>
          {AM_PM.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header - fixed top */}
      <div className="flex items-center gap-3 p-4 border-b border-border-subtle flex-shrink-0">
        <button onClick={onBack} className="text-fg-tertiary hover:text-fg-primary">
          <FaArrowLeft size={18} />
        </button>
        <h2 className="text-[16px] font-semibold text-fg-primary">
          {isEdit ? 'Edit Event' : 'New Event'}
        </h2>
      </div>

      {/* Form content - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 pb-20">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTitleError(false); }}
            placeholder={titlePlaceholder}
            className={`w-full px-4 py-3 text-[16px] text-fg-primary bg-surface-muted rounded-xl border focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-fg-tertiary ${titleError ? 'border-error placeholder:text-error animate-input-shake' : 'border-border-subtle'}`}
            autoFocus
          />
        </div>

        <div>
          <p className="text-[12px] text-fg-tertiary mb-1">Date</p>
          <button
            type="button"
            onClick={() => setShowDatePicker(true)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border-subtle bg-surface-muted text-left hover:bg-surface-muted/80 transition-colors"
          >
            <span className="text-[14px] text-fg-primary">
              {new Date(localDateStr + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <FaChevronDown size={14} className="text-fg-tertiary" />
          </button>
        </div>

        {showDatePicker && (
          <div className="p-3 bg-surface-muted rounded-xl border border-border-subtle">
            <input
              type="date"
              value={localDateStr}
              onChange={(e) => { setLocalDateStr(e.target.value); setShowDatePicker(false); }}
              className="w-full text-[14px] text-fg-primary bg-surface rounded-lg border border-border-subtle px-3 py-2"
            />
            <button
              type="button"
              onClick={() => setShowDatePicker(false)}
              className="mt-2 text-[13px] text-primary"
            >
              Done
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAllDay(true)}
            className={`px-3 py-1.5 rounded-[20px] text-[13px] font-medium border ${allDay ? 'bg-primary/10 border-primary text-primary' : 'border-border-subtle text-fg-secondary'}`}
          >
            All day
          </button>
          <button
            type="button"
            onClick={() => setAllDay(false)}
            className={`px-3 py-1.5 rounded-[20px] text-[13px] font-medium border ${!allDay ? 'bg-primary/10 border-primary text-primary' : 'border-border-subtle text-fg-secondary'}`}
          >
            Time
          </button>
        </div>

        {!allDay && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4">
              <TimeRow
                label="Start"
                hour12={hour12}
                minute={minute}
                ampm={ampm}
                onHour={setHour12}
                onMinute={setMinute}
                onAmpm={setAmpm}
              />
              <TimeRow
                label="End"
                hour12={endHour12}
                minute={endMinute}
                ampm={endAmpm}
                onHour={setEndHour12}
                onMinute={setEndMinute}
                onAmpm={setEndAmpm}
              />
            </div>
            {endTimeError && (
              <p className="text-[12px] text-error">End time must be after start</p>
            )}
          </div>
        )}

        <div>
          <div className="relative">
            <LuMapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="w-full pl-9 pr-4 py-2.5 text-[14px] text-fg-primary bg-surface-muted rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes"
            rows={3}
            className="w-full px-4 py-2.5 text-[14px] text-fg-primary bg-surface-muted rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {calendars.length > 1 && event?.calendarId !== 'nudge' && (
          <div>
            <p className="text-[12px] text-fg-tertiary mb-1">Calendar</p>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full px-4 py-2.5 text-[14px] text-fg-primary bg-surface-muted rounded-xl border border-border-subtle flex items-center"
            >
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 mt-1.5">
              {calendars.find((c) => c.id === calendarId) && (
                <>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getCalColor(undefined, calendars.find((c) => c.id === calendarId)?.backgroundColor) }}
                  />
                  <span className="text-[13px] text-fg-secondary">
                    {calendars.find((c) => c.id === calendarId)?.summary}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="text-[12px] text-fg-tertiary mb-1">Who can see this?</p>
          <button
            type="button"
            onClick={() => setShowVisibilityPicker(true)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border-subtle bg-surface-muted text-left"
          >
            <span className="flex items-center gap-2 text-[14px] text-fg-primary">
              <span className="text-[18px]">👁</span>
              {getVisibilityLabel()}
            </span>
            <span className="text-fg-tertiary">›</span>
          </button>
        </div>

        {/* Bottom padding so last field scrolls above fixed button */}
        <div className="h-20" />
      </div>

      {/* Create Event button - fixed bottom */}
      <div
        className="flex-shrink-0 p-4 pt-3 border-t border-border-subtle bg-elevated"
        style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.1)' }}
      >
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="w-full h-12 rounded-xl bg-primary text-on-accent text-[15px] font-semibold disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Event'}
        </button>
        {isEdit && onDelete && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full text-[13px] text-error hover:underline mt-2"
          >
            Delete Event
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full">
            <p className="text-[16px] font-medium text-fg-primary mb-4">Delete this event?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-fg-primary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDelete?.();
                  setShowDeleteConfirm(false);
                  onBack();
                }}
                className="flex-1 py-2.5 rounded-xl bg-error text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <VisibilityBottomSheet
        isOpen={showVisibilityPicker}
        onClose={() => setShowVisibilityPicker(false)}
        onSelect={(v, list) => {
          setVisibility(v);
          setVisibilityList(list);
          setShowVisibilityPicker(false);
        }}
        currentVisibility={visibility}
        currentVisibilityList={visibilityList}
        showSetAsDefault={false}
      />
    </div>
  );
}

export { getCalColor as getEventColor };
