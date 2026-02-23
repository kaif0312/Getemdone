'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { getTodayString } from '@/utils/taskFilter';

export type QuickOption = 'later-today' | 'tomorrow' | 'next-week' | 'pick-date';

interface ScheduleDeadlinePickerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'schedule' | 'deadline';
  onTabChange: (tab: 'schedule' | 'deadline') => void;
  scheduledFor: string | null; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  dueDate: number | null; // timestamp
  onScheduleChange: (value: string | null) => void;
  onDeadlineChange: (value: number | null) => void;
  onConfirm: () => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_15 = [0, 15, 30, 45];
const MINUTES_5 = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const AM_PM = ['AM', 'PM'];

const ROW_HEIGHT = 40;
const VISIBLE_HEIGHT = 120;
const PADDING_ROWS = 1; // Extra row top/bottom for centering selected item

function timestampToDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Later Today: 2 hours from now, rounded to nearest 15 minutes */
function getLaterTodayDateTime(): string {
  const later = new Date();
  later.setHours(later.getHours() + 2);
  const mins = later.getMinutes();
  const rounded = Math.round(mins / 15) * 15;
  later.setMinutes(rounded >= 60 ? 0 : rounded, 0, 0);
  if (rounded >= 60) later.setHours(later.getHours() + 1);
  return `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}T${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
}

function getTomorrowDateStr(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
}

function getNextWeekDateStr(): string {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function getUrgencyLabel(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays <= 14) return 'in 2 weeks';
  return `in ${Math.ceil(diffDays / 7)} weeks`;
}

/** Parse HH:mm (24h) to { hour12, minute, ampm } */
function parseTime24(time24: string): { hour12: number; minute: number; ampm: 'AM' | 'PM' } {
  const [h, m] = time24.split(':').map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'AM' : 'PM';
  return { hour12, minute: m || 0, ampm };
}

/** Format to HH:mm (24h) */
function toTime24(hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  let h = hour12;
  if (ampm === 'PM' && hour12 !== 12) h += 12;
  if (ampm === 'AM' && hour12 === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Find closest minute in array */
function closestMinute(m: number, options: number[]): number {
  return options.reduce((prev, curr) => (Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev));
}

interface ScrollWheelColumnProps<T> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  onScrollStart?: () => void;
  editable?: boolean;
  onEditCommit?: (text: string) => void;
}

function ScrollWheelColumn<T extends string | number>({
  items,
  value,
  onChange,
  format,
  onScrollStart,
  editable = false,
  onEditCommit,
}: ScrollWheelColumnProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const isUserScrollingRef = useRef(false);

  const itemHeight = ROW_HEIGHT;
  const paddingHeight = PADDING_ROWS * itemHeight;

  const scrollToIndex = useCallback(
    (index: number, smooth = false) => {
      const el = scrollRef.current;
      if (!el) return;
      const targetScroll = index * itemHeight;
      el.scrollTo({ top: targetScroll, behavior: smooth ? 'smooth' : 'auto' });
    },
    [itemHeight]
  );

  const indexOfValue = items.indexOf(value);
  const safeIndex = indexOfValue >= 0 ? indexOfValue : 0;

  useEffect(() => {
    if (isEditing) return;
    const el = scrollRef.current;
    if (!el || isUserScrollingRef.current) return;
    const targetScroll = safeIndex * itemHeight;
    if (Math.abs(el.scrollTop - targetScroll) < 2) return;
    scrollToIndex(safeIndex, false);
  }, [safeIndex, isEditing, scrollToIndex, itemHeight]);

  const scrollEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (scrollEndRef.current) clearTimeout(scrollEndRef.current);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isUserScrollingRef.current = true;
    const scrollTop = el.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    const newVal = items[clamped];
    if (newVal !== value) {
      onChange(newVal);
      if ('vibrate' in navigator) navigator.vibrate(10);
    }
    if (scrollEndRef.current) clearTimeout(scrollEndRef.current);
    scrollEndRef.current = setTimeout(() => {
      scrollEndRef.current = null;
      isUserScrollingRef.current = false;
      const st = el.scrollTop;
      const idx = Math.round(st / itemHeight);
      const c = Math.max(0, Math.min(idx, items.length - 1));
      const targetScroll = c * itemHeight;
      if (Math.abs(el.scrollTop - targetScroll) > 2) {
        el.scrollTo({ top: targetScroll, behavior: 'auto' });
      }
    }, 150);
  };

  const handleEditBlur = () => {
    setIsEditing(false);
    if (onEditCommit && editValue.trim() !== '') {
      onEditCommit(editValue.trim());
    }
  };

  if (editable && isEditing && onEditCommit) {
    return (
      <div className="flex items-center justify-center" style={{ height: VISIBLE_HEIGHT }}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleEditBlur();
            if (e.key === 'Escape') {
              setIsEditing(false);
              setEditValue(format(value));
            }
          }}
          autoFocus
          className="w-12 h-10 text-center text-base font-semibold text-primary bg-transparent border-b-2 border-primary focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto scrollbar-hide"
      style={{
        height: VISIBLE_HEIGHT,
        overscrollBehavior: 'contain',
        overflowAnchor: 'none',
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: paddingHeight, flexShrink: 0 }} />
      {items.map((item, i) => (
        <div
          key={String(item)}
          className="flex items-center justify-center flex-shrink-0 cursor-pointer select-none"
          style={{ height: itemHeight }}
          onClick={() => {
            if (editable && item === value && onEditCommit) {
              setIsEditing(true);
              setEditValue(format(value));
            } else {
              scrollToIndex(i, true);
              onChange(item);
            }
          }}
          onPointerDown={onScrollStart}
        >
          <span
            className={`transition-all ${
              item === value ? 'text-base font-semibold text-primary' : 'text-sm text-fg-tertiary opacity-50'
            }`}
          >
            {format(item)}
          </span>
        </div>
      ))}
      <div style={{ height: paddingHeight, flexShrink: 0 }} />
    </div>
  );
}

interface TimePickerWheelProps {
  hour12: number;
  minute: number;
  ampm: 'AM' | 'PM';
  preciseMinutes: boolean;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onAmpmChange: (a: 'AM' | 'PM') => void;
  onPreciseToggle: () => void;
  isDesktop: boolean;
}

function TimePickerWheel({
  hour12,
  minute,
  ampm,
  preciseMinutes,
  onHourChange,
  onMinuteChange,
  onAmpmChange,
  onPreciseToggle,
  isDesktop,
}: TimePickerWheelProps) {
  const minuteOptions = preciseMinutes ? MINUTES_5 : MINUTES_15;
  const displayMinute = minuteOptions.includes(minute) ? minute : closestMinute(minute, minuteOptions);

  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 min-w-0 relative overflow-hidden rounded-xl border border-border-subtle bg-surface">
        {/* Top fade */}
        <div
          className="absolute left-0 right-0 top-0 z-10 h-6 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, var(--color-bg-surface) 0%, transparent 100%)',
          }}
        />
        <ScrollWheelColumn
          items={HOURS_12}
          value={hour12}
          onChange={(v) => onHourChange(Number(v))}
          format={(v) => String(v)}
          editable={isDesktop}
          onEditCommit={
            isDesktop
              ? (t) => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n) && n >= 1 && n <= 12) onHourChange(n);
                }
              : undefined
          }
        />
        <div className="absolute left-0 right-0 bottom-0 z-10 h-6 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--color-bg-surface) 0%, transparent 100%)' }} />
      </div>

      <span className="text-base text-fg-secondary font-medium flex-shrink-0">:</span>

      <div className="flex-1 min-w-0 relative overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <div className="absolute left-0 right-0 top-0 z-10 h-6 pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--color-bg-surface) 0%, transparent 100%)' }} />
        <ScrollWheelColumn
          items={minuteOptions}
          value={displayMinute}
          onChange={(v) => onMinuteChange(Number(v))}
          format={(v) => String(v).padStart(2, '0')}
          editable={isDesktop}
          onEditCommit={
            isDesktop
              ? (t) => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n) && n >= 0 && n <= 59) onMinuteChange(n);
                }
              : undefined
          }
        />
        <div className="absolute left-0 right-0 bottom-0 z-10 h-6 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--color-bg-surface) 0%, transparent 100%)' }} />
      </div>

      <div className="flex-1 min-w-0 relative overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <div className="absolute left-0 right-0 top-0 z-10 h-6 pointer-events-none" style={{ background: 'linear-gradient(to bottom, var(--color-bg-surface) 0%, transparent 100%)' }} />
        <ScrollWheelColumn
          items={AM_PM}
          value={ampm}
          onChange={(v) => onAmpmChange(v as 'AM' | 'PM')}
          format={(v) => v}
        />
        <div className="absolute left-0 right-0 bottom-0 z-10 h-6 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--color-bg-surface) 0%, transparent 100%)' }} />
      </div>

      <button
        type="button"
        onClick={onPreciseToggle}
        className="text-[11px] text-fg-tertiary hover:text-fg-secondary px-2 py-1 rounded"
      >
        {preciseMinutes ? '5m' : '15m'}
      </button>
    </div>
  );
}

const QUICK_TIMES: { label: string; hour12: number; minute: number; ampm: 'AM' | 'PM' }[] = [
  { label: 'Morning (9 AM)', hour12: 9, minute: 0, ampm: 'AM' },
  { label: 'Noon', hour12: 12, minute: 0, ampm: 'PM' },
  { label: 'Afternoon (2 PM)', hour12: 2, minute: 0, ampm: 'PM' },
  { label: 'Evening (6 PM)', hour12: 6, minute: 0, ampm: 'PM' },
];

export default function ScheduleDeadlinePicker({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  scheduledFor,
  dueDate,
  onScheduleChange,
  onDeadlineChange,
  onConfirm,
}: ScheduleDeadlinePickerProps) {
  const [selectedQuickOption, setSelectedQuickOption] = useState<QuickOption | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [allDay, setAllDay] = useState(true);
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [preciseMinutes, setPreciseMinutes] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const minuteOptions = preciseMinutes ? MINUTES_5 : MINUTES_15;
  const effectiveMinute = minuteOptions.includes(minute) ? minute : closestMinute(minute, minuteOptions);

  const prevPreciseRef = useRef(preciseMinutes);
  useEffect(() => {
    if (prevPreciseRef.current !== preciseMinutes) {
      prevPreciseRef.current = preciseMinutes;
      setMinute((m) => closestMinute(m, minuteOptions));
    }
  }, [preciseMinutes, minuteOptions]);

  const todayStr = getTodayString();
  const tomorrowStr = getTomorrowDateStr();
  const nextWeekStr = getNextWeekDateStr();
  const hasSchedule = !!scheduledFor;
  const hasDeadline = !!dueDate;
  const hasValue = activeTab === 'schedule' ? hasSchedule : hasDeadline;

  useEffect(() => {
    setIsDesktop(typeof window !== 'undefined' && window.innerWidth >= 768);
  }, []);

  const getSelectedDateStr = useCallback((): string | null => {
    if (activeTab === 'schedule' && scheduledFor) return scheduledFor.split('T')[0];
    if (activeTab === 'deadline' && dueDate) return timestampToDateStr(dueDate);
    return null;
  }, [activeTab, scheduledFor, dueDate]);

  const getEffectiveDateStr = (): string => {
    const sel = getSelectedDateStr();
    if (sel) return sel;
    if (selectedQuickOption === 'later-today') return todayStr;
    if (selectedQuickOption === 'tomorrow') return tomorrowStr;
    if (selectedQuickOption === 'next-week') return nextWeekStr;
    if (selectedQuickOption === 'pick-date' && showCustomPicker) return todayStr;
    return todayStr;
  };

  const applyTimeToValue = useCallback(
    (dateStr: string, timeStr: string | null) => {
      const value = timeStr ? `${dateStr}T${timeStr}` : dateStr;
      if (activeTab === 'schedule') {
        onScheduleChange(value);
      } else {
        onDeadlineChange(new Date(value || `${dateStr}T09:00`).getTime());
      }
    },
    [activeTab, onScheduleChange, onDeadlineChange]
  );

  const syncTimeFromValue = useCallback(() => {
    let time24 = '';
    if (activeTab === 'schedule' && scheduledFor?.includes('T')) {
      time24 = scheduledFor.split('T')[1]?.slice(0, 5) || '';
    } else if (activeTab === 'deadline' && dueDate) {
      const d = new Date(dueDate);
      time24 = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (time24) {
      const { hour12: h, minute: m, ampm: a } = parseTime24(time24);
      setHour12(h);
      setMinute(closestMinute(m, MINUTES_15));
      setAmpm(a);
      setAllDay(false);
    } else {
      setAllDay(true);
    }
  }, [activeTab, scheduledFor, dueDate]);

  const setTimeFromWheel = useCallback(
    (h: number, m: number, a: 'AM' | 'PM') => {
      const time24 = toTime24(h, m, a);
      setAllDay(false);
      applyTimeToValue(getEffectiveDateStr(), time24);
    },
    [applyTimeToValue, getEffectiveDateStr]
  );

  useEffect(() => {
    if (isOpen && hasValue) {
      syncTimeFromValue();
    }
  }, [isOpen, hasValue, syncTimeFromValue]);

  useEffect(() => {
    if (isOpen && !hasValue) {
      setAllDay(true);
    }
  }, [isOpen, hasValue]);

  const handleQuickSelect = (option: QuickOption) => {
    setSelectedQuickOption(option);
    if (option === 'pick-date') {
      setShowCustomPicker(true);
      setAllDay(true);
    } else {
      setShowCustomPicker(false);
      const dateStr = option === 'later-today' ? todayStr : option === 'tomorrow' ? tomorrowStr : nextWeekStr;
      if (option === 'later-today') {
        const val = getLaterTodayDateTime();
        const { hour12: h, minute: m, ampm: a } = parseTime24(val.split('T')[1] || '09:00');
        setHour12(h);
        setMinute(m);
        setAmpm(a);
        setAllDay(false);
        if (activeTab === 'schedule') onScheduleChange(val);
        else onDeadlineChange(new Date(val).getTime());
      } else {
        setAllDay(true);
        if (activeTab === 'schedule') onScheduleChange(dateStr);
        else onDeadlineChange(new Date(`${dateStr}T09:00`).getTime());
      }
    }
  };

  const handleDateSelect = (dateStr: string) => {
    if (allDay) {
      if (activeTab === 'schedule') onScheduleChange(dateStr);
      else onDeadlineChange(new Date(`${dateStr}T09:00`).getTime());
    } else {
      const time24 = toTime24(hour12, effectiveMinute, ampm);
      applyTimeToValue(dateStr, time24);
    }
  };

  const handleTimeWheelChange = (h: number, m: number, a: 'AM' | 'PM') => {
    setHour12(h);
    setMinute(m);
    setAmpm(a);
    setTimeFromWheel(h, m, a);
  };

  const handleQuickTime = (qt: (typeof QUICK_TIMES)[0]) => {
    setHour12(qt.hour12);
    setMinute(qt.minute);
    setAmpm(qt.ampm);
    setAllDay(false);
    setTimeFromWheel(qt.hour12, qt.minute, qt.ampm);
  };

  const handleRemove = () => {
    if (activeTab === 'schedule') {
      onScheduleChange(null);
      setSelectedQuickOption(null);
      setShowCustomPicker(false);
    } else {
      onDeadlineChange(null);
      setSelectedQuickOption(null);
      setShowCustomPicker(false);
    }
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const canConfirm = hasValue;

  const getMatchingQuickOption = (): QuickOption | null => {
    if (!hasValue) return null;
    if (activeTab === 'schedule' && scheduledFor) {
      const datePart = scheduledFor.split('T')[0];
      if (datePart === todayStr && scheduledFor.includes('T')) return 'later-today';
      if (datePart === tomorrowStr) return 'tomorrow';
      if (datePart === nextWeekStr) return 'next-week';
      return 'pick-date';
    }
    if (activeTab === 'deadline' && dueDate) {
      const dateStr = timestampToDateStr(dueDate);
      if (dateStr === todayStr) return 'later-today';
      if (dateStr === tomorrowStr) return 'tomorrow';
      if (dateStr === nextWeekStr) return 'next-week';
      return 'pick-date';
    }
    return null;
  };

  const matchingOption = getMatchingQuickOption();
  const hasDateSelected = selectedQuickOption !== null || hasValue;

  useEffect(() => {
    setSelectedQuickOption(null);
    setShowCustomPicker(false);
  }, [activeTab]);

  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const prevMonth = () => {
    setCalendarMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }));
  };
  const nextMonth = () => {
    setCalendarMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }));
  };

  const isPastDate = (day: number) => {
    const d = new Date(calendarMonth.year, calendarMonth.month, day);
    const today = new Date();
    return d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  };

  const getSummaryText = (): string => {
    const dateStr = getEffectiveDateStr();
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    const dateLabel =
      dateStr === todayStr ? 'Today' : dateStr === tomorrowStr ? 'Tomorrow' : dateStr === nextWeekStr ? 'Next Week' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (allDay) {
      return activeTab === 'schedule' ? `Scheduled for ${dateLabel} (no specific time)` : `Due by ${dateLabel} (no specific time)`;
    }
    const timeStr = `${hour12}:${String(effectiveMinute).padStart(2, '0')} ${ampm}`;
    return activeTab === 'schedule' ? `Scheduled for ${dateLabel} at ${timeStr}` : `Due by ${dateLabel} at ${timeStr}`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-[4px] animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[99999] max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="bg-surface dark:bg-elevated rounded-t-2xl flex flex-col max-h-[85vh] overflow-hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-none dark:border-t dark:border-border-subtle">
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" aria-hidden="true" />
          </div>

          <div className="px-5 pb-5 pt-0 flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex border-b border-border-subtle flex-shrink-0">
              <button
                type="button"
                onClick={() => onTabChange('schedule')}
                className={`flex-1 min-h-[44px] text-sm font-medium transition-colors ${
                  activeTab === 'schedule' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-fg-secondary'
                }`}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => onTabChange('deadline')}
                className={`flex-1 min-h-[44px] text-sm font-medium transition-colors ${
                  activeTab === 'deadline' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-fg-secondary'
                }`}
              >
                Deadline
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['later-today', 'tomorrow', 'next-week', 'pick-date'] as const).map((opt) => {
                  const isSelected =
                    selectedQuickOption === opt ||
                    (selectedQuickOption === null && matchingOption === opt) ||
                    (opt === 'pick-date' && showCustomPicker) ||
                    (opt === 'pick-date' && matchingOption === 'pick-date');
                  const label = opt === 'later-today' ? 'Later Today' : opt === 'pick-date' ? 'Pick Date' : opt === 'next-week' ? 'Next Week' : 'Tomorrow';
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleQuickSelect(opt)}
                      className={`px-5 py-2.5 rounded-[20px] text-[13px] font-medium border-[1.5px] transition-all active:scale-[0.97] ${
                        isSelected ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border-emphasized text-fg-primary hover:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {(showCustomPicker || (hasValue && matchingOption === 'pick-date')) && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={prevMonth} className="p-2 -ml-2 hover:bg-surface-muted rounded-lg transition-colors text-fg-secondary">
                        <FaChevronLeft size={16} />
                      </button>
                      <span className="text-sm font-semibold text-fg-primary">
                        {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                      </span>
                      <button type="button" onClick={nextMonth} className="p-2 -mr-2 hover:bg-surface-muted rounded-lg transition-colors text-fg-secondary">
                        <FaChevronRight size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={i} className="w-9 h-9 flex items-center justify-center text-xs font-medium text-fg-tertiary">
                          {d}
                        </div>
                      ))}
                      {calendarDays.map((day, i) => {
                        if (day === null) return <div key={`e-${i}`} className="w-9 h-9" />;
                        const dateStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isToday = dateStr === todayStr;
                        const selectedStr = getSelectedDateStr();
                        const selected = selectedStr === dateStr;
                        const past = isPastDate(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => !past && handleDateSelect(dateStr)}
                            disabled={past}
                            className={`w-9 h-9 flex items-center justify-center text-sm font-medium rounded-lg transition-colors ${
                              past ? 'text-fg-tertiary/50 cursor-not-allowed' : selected ? 'bg-primary text-on-accent' : isToday ? 'ring-[1.5px] ring-primary text-fg-primary hover:bg-primary/10' : 'text-fg-primary hover:bg-surface-muted'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Time picker - always shown when any date option selected */}
              {hasDateSelected && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAllDay(true);
                        const dateStr = getEffectiveDateStr();
                        if (activeTab === 'schedule') onScheduleChange(dateStr);
                        else onDeadlineChange(new Date(`${dateStr}T09:00`).getTime());
                      }}
                      className={`px-3 py-1.5 rounded-[20px] text-[13px] font-medium border transition-all ${
                        allDay ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border-emphasized text-fg-secondary hover:border-primary/50'
                      }`}
                    >
                      All day
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAllDay(false);
                        setTimeFromWheel(hour12, effectiveMinute, ampm);
                      }}
                      className="text-[12px] text-fg-tertiary hover:text-fg-secondary transition-colors"
                    >
                      Time (optional)
                    </button>
                  </div>

                  {!allDay && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_TIMES.map((qt) => (
                          <button
                            key={qt.label}
                            type="button"
                            onClick={() => handleQuickTime(qt)}
                            className="px-4 py-2 rounded-[20px] text-[13px] font-medium border border-border-emphasized text-fg-primary hover:border-primary/50 transition-all"
                          >
                            {qt.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-3 rounded-xl border border-border-subtle bg-surface">
                        <TimePickerWheel
                          hour12={hour12}
                          minute={minute}
                          ampm={ampm}
                          preciseMinutes={preciseMinutes}
                          onHourChange={(h) => handleTimeWheelChange(h, minute, ampm)}
                          onMinuteChange={(m) => handleTimeWheelChange(hour12, m, ampm)}
                          onAmpmChange={(a) => handleTimeWheelChange(hour12, minute, a)}
                          onPreciseToggle={() => setPreciseMinutes((p) => !p)}
                          isDesktop={isDesktop}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'deadline' && dueDate && (
                <p className="text-sm text-fg-secondary">{getUrgencyLabel(dueDate)}</p>
              )}

              {hasDateSelected && (
                <p className="text-[13px] text-fg-secondary text-center">{getSummaryText()}</p>
              )}
            </div>

            {hasValue && (
              <button type="button" onClick={handleRemove} className="w-full text-sm text-error py-2 mb-2 hover:underline">
                Remove
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="w-full h-12 rounded-xl bg-primary text-on-accent text-[15px] font-semibold disabled:opacity-40 disabled:pointer-events-none transition-opacity"
            >
              {activeTab === 'schedule' ? 'Set Schedule' : 'Set Deadline'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
