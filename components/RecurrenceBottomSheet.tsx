'use client';

import { Recurrence } from '@/lib/types';
import { FaTimes } from 'react-icons/fa';

interface RecurrenceBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (recurrence: Recurrence) => void;
  onRemove?: () => void;
  currentRecurrence?: Recurrence | null;
}

export default function RecurrenceBottomSheet({
  isOpen,
  onClose,
  onSelect,
  onRemove,
  currentRecurrence,
}: RecurrenceBottomSheetProps) {
  if (!isOpen) return null;

  const today = new Date();
  const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const handlePreset = (freq: Recurrence['frequency'], days?: number[]) => {
    const r: Recurrence = {
      frequency: freq,
      startDate,
      ...(days && days.length > 0 && { days }),
    };
    onSelect(r);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[99998] bg-black/40 dark:bg-black/60"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[99999] bg-surface rounded-t-2xl shadow-elevation-3 border-t border-border-subtle animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-lg font-semibold text-fg-primary">
            Set recurrence
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-muted text-fg-tertiary"
          >
            <FaTimes size={18} />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-2">
          <button
            type="button"
            onClick={() => handlePreset('daily')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 text-fg-primary transition-colors"
          >
            <span>Daily</span>
            <span className="text-sm text-fg-tertiary">Every day</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset('weekdays')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 text-fg-primary transition-colors"
          >
            <span>Weekdays</span>
            <span className="text-sm text-fg-tertiary">Mon–Fri</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset('weekly', [today.getDay()])}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 text-fg-primary transition-colors"
          >
            <span>Weekly</span>
            <span className="text-sm text-fg-tertiary">
              Every {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()]}
            </span>
          </button>

          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handlePreset('custom', [d])}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface-muted hover:bg-surface-muted/80 text-fg-primary transition-colors"
            >
              <span>Every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}</span>
            </button>
          ))}

          {currentRecurrence && onRemove && (
            <>
              <div className="border-t border-border-subtle my-3" />
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="w-full px-4 py-3 rounded-xl text-error hover:bg-error/10 transition-colors font-medium"
              >
                Remove recurrence
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
