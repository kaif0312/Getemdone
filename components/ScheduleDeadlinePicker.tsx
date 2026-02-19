'use client';

import { useState, useRef, useEffect } from 'react';
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

function timestampToDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLaterTodayDateTime(): string {
  const later = new Date();
  later.setHours(later.getHours() + 1);
  later.setMinutes(Math.ceil(later.getMinutes() / 15) * 15, 0, 0);
  return `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}T${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
}

function getTomorrowDateStr(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
}

function getTomorrowDateTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T09:00`;
}

function getNextWeekDateTime(): string {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  next.setHours(9, 0, 0, 0);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}T09:00`;
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
  const [customTime, setCustomTime] = useState('');
  const timeInputRef = useRef<HTMLInputElement>(null);

  const todayStr = getTodayString();
  const tomorrowStr = getTomorrowDateStr();
  const nextWeekStr = getNextWeekDateStr();
  const hasSchedule = !!scheduledFor;
  const hasDeadline = !!dueDate;
  const hasValue = activeTab === 'schedule' ? hasSchedule : hasDeadline;

  // Sync customTime from existing value when picker opens
  useEffect(() => {
    if (isOpen && hasValue) {
      if (activeTab === 'schedule' && scheduledFor?.includes('T')) {
        setCustomTime(scheduledFor.split('T')[1]?.slice(0, 5) || '');
      } else if (activeTab === 'deadline' && dueDate) {
        const d = new Date(dueDate);
        setCustomTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      }
    } else if (isOpen && !hasValue) {
      setCustomTime('');
    }
  }, [isOpen, hasValue, activeTab, scheduledFor, dueDate]);

  const handleQuickSelect = (option: QuickOption) => {
    setSelectedQuickOption(option);
    if (option === 'pick-date') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      if (option === 'later-today') {
        const val = getLaterTodayDateTime();
        if (activeTab === 'schedule') onScheduleChange(val);
        else onDeadlineChange(new Date(val).getTime());
      } else if (option === 'tomorrow') {
        const val = getTomorrowDateTime();
        if (activeTab === 'schedule') onScheduleChange(val);
        else onDeadlineChange(new Date(val).getTime());
      } else if (option === 'next-week') {
        const val = getNextWeekDateTime();
        if (activeTab === 'schedule') onScheduleChange(val);
        else onDeadlineChange(new Date(val).getTime());
      }
    }
  };

  const handleDateSelect = (dateStr: string) => {
    const timePart = customTime || (activeTab === 'deadline' ? '09:00' : '');
    const value = timePart ? `${dateStr}T${timePart}` : dateStr;
    if (activeTab === 'schedule') {
      onScheduleChange(value);
    } else {
      onDeadlineChange(new Date(value).getTime());
    }
  };

  const handleTimeChange = (timeVal: string) => {
    setCustomTime(timeVal);
    const selectedStr = getSelectedDateStr();
    const dateStr = selectedStr || todayStr;
    if (timeVal) {
      handleDateSelect(`${dateStr}T${timeVal}`);
    } else if (activeTab === 'schedule') {
      onScheduleChange(dateStr);
    } else if (activeTab === 'deadline') {
      onDeadlineChange(new Date(`${dateStr}T09:00`).getTime());
    }
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

  // Compute which quick option matches current value (for chip highlighting)
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

  // Reset when tab changes
  useEffect(() => {
    setSelectedQuickOption(null);
    setShowCustomPicker(false);
  }, [activeTab]);

  // Build calendar grid
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

  const getSelectedDateStr = (): string | null => {
    if (activeTab === 'schedule' && scheduledFor) return scheduledFor.split('T')[0];
    if (activeTab === 'deadline' && dueDate) return timestampToDateStr(dueDate);
    return null;
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
        className="fixed inset-x-0 bottom-0 z-[99999] max-h-[60vh] flex flex-col animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="bg-surface dark:bg-elevated rounded-t-2xl flex flex-col max-h-[60vh] overflow-hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-none dark:border-t dark:border-border-subtle">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" aria-hidden="true" />
          </div>

          <div className="px-5 pb-5 pt-0 flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Tab switcher */}
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
              {/* Quick select chips */}
              <div className="flex flex-wrap gap-2">
                {(['later-today', 'tomorrow', 'next-week', 'pick-date'] as const).map((opt) => {
                  const isSelected = selectedQuickOption === opt || (selectedQuickOption === null && matchingOption === opt) || (opt === 'pick-date' && showCustomPicker) || (opt === 'pick-date' && matchingOption === 'pick-date');
                  const label = opt === 'later-today' ? 'Later Today' : opt === 'pick-date' ? 'Pick Date' : opt === 'next-week' ? 'Next Week' : 'Tomorrow';
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleQuickSelect(opt)}
                      className={`px-5 py-2.5 rounded-[20px] text-sm font-medium border-[1.5px] transition-all active:scale-[0.97] ${
                        isSelected ? 'bg-primary/10 border-primary text-primary' : 'bg-transparent border-border-emphasized text-fg-primary hover:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Custom date picker - shown when Pick Date selected or existing value is a custom date */}
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
                              past
                                ? 'text-fg-tertiary/50 cursor-not-allowed'
                                : selected
                                ? 'bg-primary text-on-accent'
                                : isToday
                                ? 'ring-[1.5px] ring-primary text-fg-primary hover:bg-primary/10'
                                : 'text-fg-primary hover:bg-surface-muted'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time input */}
                  <div>
                    <label className="block text-xs text-fg-tertiary mb-1.5">Set time (optional)</label>
                    <input
                      ref={timeInputRef}
                      type="time"
                      value={customTime}
                      onChange={(e) => handleTimeChange(e.target.value)}
                      className="w-full px-4 py-3 text-sm text-fg-primary bg-background rounded-[10px] border-0 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              )}

              {/* Urgency label for deadline */}
              {activeTab === 'deadline' && dueDate && (
                <p className="text-sm text-fg-secondary">{getUrgencyLabel(dueDate)}</p>
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
