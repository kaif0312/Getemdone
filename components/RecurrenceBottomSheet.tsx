'use client';

import { useState, useEffect, useCallback } from 'react';
import { Recurrence } from '@/lib/types';
import { FaTimes, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { getRecurrenceSummary } from '@/utils/recurrence';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type PresetKey = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

interface RecurrenceBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (recurrence: Recurrence) => void;
  onRemove?: () => void;
  currentRecurrence?: Recurrence | null;
  /** Optional date context (YYYY-MM-DD) for Weekly/Monthly defaults */
  scheduledDate?: string;
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecurrenceBottomSheet({
  isOpen,
  onClose,
  onSelect,
  onRemove,
  currentRecurrence,
  scheduledDate,
}: RecurrenceBottomSheetProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [customExpanded, setCustomExpanded] = useState(false);
  const [endsExpanded, setEndsExpanded] = useState(false);

  const dateStr = scheduledDate || getTodayString();
  const [y, m, d] = dateStr.split('-').map(Number);
  const refDate = new Date(y, m - 1, d);
  const refDayOfWeek = refDate.getDay();
  const refDayOfMonth = refDate.getDate();

  const [selectedPreset, setSelectedPreset] = useState<PresetKey | null>(null);
  const [customInterval, setCustomInterval] = useState(2);
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [customDays, setCustomDays] = useState<number[]>([refDayOfWeek]);
  const [customDayOfMonth, setCustomDayOfMonth] = useState(refDayOfMonth);
  const [customLastDay, setCustomLastDay] = useState(false);
  const [endType, setEndType] = useState<'never' | 'onDate' | 'afterOccurrences'>('never');
  const [endDate, setEndDate] = useState('');
  const [endAfterOccurrences, setEndAfterOccurrences] = useState(10);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [endDateCalendarMonth, setEndDateCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const checkMobile = useCallback(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  useEffect(() => {
    if (isOpen && currentRecurrence) {
      if (currentRecurrence.frequency === 'daily') setSelectedPreset('daily');
      else if (currentRecurrence.frequency === 'weekdays') setSelectedPreset('weekdays');
      else if (currentRecurrence.frequency === 'weekly') setSelectedPreset('weekly');
      else if (currentRecurrence.frequency === 'biweekly') setSelectedPreset('biweekly');
      else if (currentRecurrence.frequency === 'monthly') setSelectedPreset('monthly');
      else {
        setSelectedPreset('custom');
        setCustomExpanded(true);
        setCustomInterval(currentRecurrence.interval ?? 2);
        setCustomUnit(currentRecurrence.intervalUnit ?? 'weeks');
        setCustomDays(currentRecurrence.days ?? [refDayOfWeek]);
        setCustomDayOfMonth(currentRecurrence.dayOfMonth ?? refDayOfMonth);
        setCustomLastDay(currentRecurrence.dayOfMonth === -1);
      }
      setEndType(currentRecurrence.endType ?? 'never');
      setEndDate(currentRecurrence.endDate ?? '');
      setEndAfterOccurrences(currentRecurrence.endAfterOccurrences ?? 10);
    } else if (isOpen) {
      setSelectedPreset(null);
      setCustomExpanded(false);
      setEndsExpanded(false);
      setCustomInterval(2);
      setCustomUnit('weeks');
      setCustomDays([refDayOfWeek]);
      setCustomDayOfMonth(refDayOfMonth);
      setCustomLastDay(false);
      setEndType('never');
      setEndDate('');
      setEndAfterOccurrences(10);
      setShowEndDatePicker(false);
    }
  }, [isOpen, currentRecurrence, refDayOfWeek, refDayOfMonth]);

  const formatEndDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}/${y}`;
  };

  const toggleCustomDay = (day: number) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const buildRecurrence = useCallback((): Recurrence | null => {
    const startDate = dateStr;
    const base: Recurrence = {
      frequency: 'daily',
      startDate,
      endType: endType === 'never' ? undefined : endType,
      ...(endType === 'onDate' && endDate && { endDate }),
      ...(endType === 'afterOccurrences' && { endAfterOccurrences }),
    };

    if (selectedPreset === 'daily') {
      return { ...base, frequency: 'daily' };
    }
    if (selectedPreset === 'weekdays') {
      return { ...base, frequency: 'weekdays' };
    }
    if (selectedPreset === 'weekly') {
      return { ...base, frequency: 'weekly', days: [refDayOfWeek] };
    }
    if (selectedPreset === 'biweekly') {
      return { ...base, frequency: 'biweekly', days: [refDayOfWeek] };
    }
    if (selectedPreset === 'monthly') {
      return {
        ...base,
        frequency: 'monthly',
        dayOfMonth: refDayOfMonth,
      };
    }
    if (selectedPreset === 'custom') {
      const dom = customLastDay ? -1 : customDayOfMonth;
      if (customUnit === 'days') {
        return { ...base, frequency: 'custom', interval: customInterval, intervalUnit: 'days' };
      }
      if (customUnit === 'weeks') {
        const days = customDays.length > 0 ? customDays : [refDayOfWeek];
        return { ...base, frequency: 'custom', interval: customInterval, intervalUnit: 'weeks', days };
      }
      return { ...base, frequency: 'custom', interval: customInterval, intervalUnit: 'months', dayOfMonth: dom };
    }
    return null;
  }, [
    dateStr,
    endType,
    endDate,
    endAfterOccurrences,
    selectedPreset,
    refDayOfWeek,
    refDayOfMonth,
    customLastDay,
    customInterval,
    customUnit,
    customDays,
    customDayOfMonth,
  ]);

  const recurrence = buildRecurrence();
  const summary = getRecurrenceSummary(recurrence);
  const canConfirm = recurrence !== null;

  const handleConfirm = () => {
    if (recurrence) {
      onSelect(recurrence);
      onClose();
    }
  };

  if (!isOpen) return null;

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold text-fg-primary truncate">Set recurrence</h3>
          {currentRecurrence && onRemove && (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="text-[13px] text-error font-medium hover:underline shrink-0"
            >
              Remove
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-muted transition-colors -mr-1"
          aria-label="Close"
        >
          <FaTimes size={20} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: isMobile ? 'calc(70vh - 180px)' : 'none' }}>
        {/* Section 1 — Quick Presets */}
        <div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'daily' as const, label: 'Daily', desc: 'Every day' },
              { key: 'weekdays' as const, label: 'Weekdays', desc: 'Mon–Fri' },
              {
                key: 'weekly' as const,
                label: 'Weekly',
                desc: `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][refDayOfWeek]}`,
              },
              { key: 'biweekly' as const, label: 'Biweekly', desc: 'Every 2 weeks' },
              {
                key: 'monthly' as const,
                label: 'Monthly',
                desc: `${refDayOfMonth}${refDayOfMonth === 1 ? 'st' : refDayOfMonth === 2 ? 'nd' : refDayOfMonth === 3 ? 'rd' : 'th'} of each month`,
              },
            ].map(({ key, label, desc }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedPreset(key);
                  setCustomExpanded(false);
                }}
                className={`flex flex-col items-start px-4 py-2 rounded-[20px] border-[1.5px] text-left transition-all ${
                  selectedPreset === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-subtle bg-transparent text-fg-secondary hover:border-fg-tertiary'
                }`}
              >
                <span className="text-[14px] font-medium">{label}</span>
                <span className="text-[12px] opacity-80">{desc}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelectedPreset('custom');
                setCustomExpanded(!customExpanded);
              }}
              className={`flex flex-col items-start px-4 py-2 rounded-[20px] border-[1.5px] text-left transition-all ${
                selectedPreset === 'custom'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border-subtle bg-transparent text-fg-secondary hover:border-fg-tertiary'
              }`}
            >
              <span className="text-[14px] font-medium">Custom</span>
            </button>
          </div>
        </div>

        {/* Section 2 — Custom (expandable) */}
        {selectedPreset === 'custom' && customExpanded && (
          <div
            className="space-y-4 overflow-hidden animate-in slide-in-from-top-2 duration-200 transition-all"
            style={{ animationDuration: '200ms' }}
          >
            <div className="pt-2 border-t border-border-subtle space-y-4">
              {/* Repeat every */}
              <div>
                <p className="text-[13px] font-medium text-fg-secondary mb-2">REPEAT EVERY</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg bg-surface border border-border-subtle overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCustomInterval((v) => Math.max(1, v - 1))}
                      className="w-9 h-9 flex items-center justify-center text-fg-secondary hover:bg-surface-muted"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={customInterval}
                      onChange={(e) => setCustomInterval(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-12 h-9 text-center text-sm bg-transparent border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomInterval((v) => Math.min(99, v + 1))}
                      className="w-9 h-9 flex items-center justify-center text-fg-secondary hover:bg-surface-muted"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-border-subtle">
                    {(['days', 'weeks', 'months'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setCustomUnit(u)}
                        className={`px-3 py-2 text-[13px] font-medium capitalize transition-colors active:scale-95 ${
                          customUnit === u
                            ? 'bg-primary text-white'
                            : 'bg-surface text-fg-secondary hover:bg-surface-muted'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* On these days (weeks only) */}
              {customUnit === 'weeks' && (
                <div>
                  <p className="text-[13px] font-medium text-fg-secondary mb-2">ON THESE DAYS</p>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleCustomDay(day)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-medium border transition-transform active:scale-95 ${
                          customDays.includes(day)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface text-fg-secondary border-border-subtle hover:border-fg-tertiary'
                        }`}
                      >
                        {DAY_NAMES[day]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* On day (months only) */}
              {customUnit === 'months' && (
                <div>
                  <p className="text-[13px] font-medium text-fg-secondary mb-2">ON DAY</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center rounded-lg bg-surface border border-border-subtle overflow-hidden">
                      <span className="pl-3 text-[13px] text-fg-secondary">On day</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={customLastDay ? 31 : customDayOfMonth}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 1;
                          setCustomLastDay(false);
                          setCustomDayOfMonth(Math.min(31, Math.max(1, v)));
                        }}
                        disabled={customLastDay}
                        className="w-12 h-9 text-center text-sm bg-transparent border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="pr-3 text-[13px] text-fg-secondary">of each month</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customLastDay}
                        onChange={(e) => {
                          setCustomLastDay(e.target.checked);
                          if (e.target.checked) setCustomDayOfMonth(-1);
                        }}
                        className="rounded"
                      />
                      <span className="text-[13px] text-fg-secondary">Last day of month</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 3 — Ends (expandable) */}
        <div>
          {!endsExpanded ? (
            <button
              type="button"
              onClick={() => setEndsExpanded(true)}
              className="text-[13px] text-primary hover:text-primary/80 transition-colors"
            >
              + Ends
            </button>
          ) : (
            <div className="pt-3 border-t border-border-subtle space-y-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium text-fg-tertiary uppercase tracking-[0.05em]">ENDS</p>
                <button
                  type="button"
                  onClick={() => setEndsExpanded(false)}
                  className="text-[13px] text-primary hover:text-primary/80 transition-colors -mr-1"
                >
                  −
                </button>
              </div>
              {[
                { key: 'never' as const, label: 'Never' },
                { key: 'onDate' as const, label: 'On date' },
                { key: 'afterOccurrences' as const, label: `After ${endAfterOccurrences} occurrences` },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 min-h-[40px] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="endType"
                    checked={endType === key}
                    onChange={() => {
                      setEndType(key);
                      if (key === 'onDate') setShowEndDatePicker(true);
                      else setShowEndDatePicker(false);
                    }}
                    className="recurrence-end-radio w-4 h-4 rounded-full focus:ring-primary/30 focus:ring-2 focus:ring-offset-0 shrink-0"
                  />
                  <span className="text-[14px] text-fg-primary">{label}</span>
                  {key === 'onDate' && (
                    <button
                      type="button"
                      onClick={() => setShowEndDatePicker(!showEndDatePicker)}
                      className={`ml-auto min-w-[100px] text-[13px] rounded-lg px-3 py-2 text-left transition-colors ${
                        endDate ? 'text-fg-primary bg-surface border border-border-subtle' : 'text-fg-tertiary bg-surface border border-border-subtle placeholder:text-fg-tertiary'
                      }`}
                    >
                      {endDate ? formatEndDateDisplay(endDate) : 'mm/dd/yyyy'}
                    </button>
                  )}
                  {key === 'afterOccurrences' && (
                    <div className="ml-auto flex items-center gap-0">
                      <button
                        type="button"
                        onClick={() => setEndAfterOccurrences((v) => Math.max(1, v - 1))}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-surface border border-border-subtle text-fg-secondary hover:bg-surface-muted active:scale-95 transition-transform"
                      >
                        −
                      </button>
                      <span className="w-12 text-center text-base font-semibold text-fg-primary">
                        {endAfterOccurrences}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEndAfterOccurrences((v) => Math.min(999, v + 1))}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-surface border border-border-subtle text-fg-secondary hover:bg-surface-muted active:scale-95 transition-transform"
                      >
                        +
                      </button>
                    </div>
                  )}
                </label>
              ))}
              {endType === 'onDate' && showEndDatePicker && (() => {
                const daysInMonth = new Date(endDateCalendarMonth.year, endDateCalendarMonth.month + 1, 0).getDate();
                const firstDay = new Date(endDateCalendarMonth.year, endDateCalendarMonth.month, 1).getDay();
                const calendarDays: (number | null)[] = [];
                for (let i = 0; i < firstDay; i++) calendarDays.push(null);
                for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
                const todayStr = getTodayString();
                const isPastDate = (day: number) => {
                  const d = new Date(endDateCalendarMonth.year, endDateCalendarMonth.month, day);
                  return d < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                };
                return (
                  <div className="mt-3 pt-3 border-t border-border-subtle animate-in fade-in duration-150">
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={() => setEndDateCalendarMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }))} className="p-2 -ml-2 hover:bg-surface-muted rounded-lg transition-colors text-fg-secondary">
                        <FaChevronLeft size={16} />
                      </button>
                      <span className="text-sm font-semibold text-fg-primary">
                        {MONTH_NAMES[endDateCalendarMonth.month]} {endDateCalendarMonth.year}
                      </span>
                      <button type="button" onClick={() => setEndDateCalendarMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }))} className="p-2 -mr-2 hover:bg-surface-muted rounded-lg transition-colors text-fg-secondary">
                        <FaChevronRight size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {DAY_NAMES.map((d, i) => (
                        <div key={i} className="w-9 h-9 flex items-center justify-center text-xs font-medium text-fg-tertiary">
                          {d}
                        </div>
                      ))}
                      {calendarDays.map((day, i) => {
                        if (day === null) return <div key={`e-${i}`} className="w-9 h-9" />;
                        const dateStr = `${endDateCalendarMonth.year}-${String(endDateCalendarMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isToday = dateStr === todayStr;
                        const selected = endDate === dateStr;
                        const past = isPastDate(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => !past && (setEndDate(dateStr), setShowEndDatePicker(false))}
                            disabled={past}
                            className={`w-9 h-9 flex items-center justify-center text-sm font-medium rounded-lg transition-colors active:scale-95 ${
                              past ? 'text-fg-tertiary/50 cursor-not-allowed' : selected ? 'bg-primary text-on-accent' : isToday ? 'ring-[1.5px] ring-primary text-fg-primary hover:bg-primary/10' : 'text-fg-primary hover:bg-surface-muted'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>

      {/* Summary line + Confirm button */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-border-subtle" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        {summary && (
          <p className="text-[13px] text-fg-secondary text-center py-2">
            {summary}
          </p>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full h-12 rounded-xl bg-primary text-white text-[15px] font-semibold disabled:opacity-40 transition-opacity"
        >
          Set Recurrence
        </button>
      </div>
    </>
  );

  const backdropClass = 'fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm';
  const panelClass = 'bg-elevated flex flex-col shadow-elevation-2';

  if (isMobile) {
    return (
      <>
        <div className={`${backdropClass}`} onClick={onClose} />
        <div
          className={`fixed inset-x-0 bottom-0 z-[99999] ${panelClass} rounded-t-[16px] max-h-[70vh] animate-in slide-in-from-bottom duration-250`}
          style={{ animationDuration: '250ms' }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-fg-tertiary/40" />
          </div>
          {content}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`${backdropClass}`} onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <div
          className={`w-full max-w-[420px] ${panelClass} rounded-2xl overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </>
  );
}
