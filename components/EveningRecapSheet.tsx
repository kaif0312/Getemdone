'use client';

import { useState, useRef, useCallback } from 'react';
import { FocusSession, Task } from '@/lib/types';
import { LuCheck, LuArrowRight, LuCalendar, LuX, LuZap } from 'react-icons/lu';
import Confetti from './Confetti';

type TaskAction = 'rollover' | 'skip' | 'reschedule';

interface EveningRecapSheetProps {
  isOpen: boolean;
  yesterdaySession: FocusSession;
  tasks: Task[];
  todayStr: string;
  onComplete: () => void;
  onSkip: () => void;
  onRolloverTask: (taskId: string) => void;
  onSkipTask: (taskId: string) => Promise<void>;
  onRescheduleTask: (taskId: string, date: string) => Promise<void>;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getTomorrow(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getNextWeek(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 7);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function EveningRecapSheet({
  isOpen,
  yesterdaySession,
  tasks,
  todayStr,
  onComplete,
  onSkip,
  onRolloverTask,
  onSkipTask,
  onRescheduleTask,
}: EveningRecapSheetProps) {
  const [taskActions, setTaskActions] = useState<Record<string, TaskAction>>({});
  const [rescheduleOpen, setRescheduleOpen] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const startYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const delta = e.changedTouches[0].clientY - startYRef.current;
    if (delta > 80) onSkip();
    startYRef.current = null;
  };

  const getTaskText = useCallback((taskId: string): string => {
    return tasks.find((t) => t.id === taskId)?.text ?? 'Task';
  }, [tasks]);

  const completedIds = new Set(yesterdaySession.completedTaskIds ?? []);
  const completedFocusIds = yesterdaySession.taskIds.filter((id) => completedIds.has(id));
  const incompleteFocusIds = yesterdaySession.taskIds.filter((id) => !completedIds.has(id));
  const allIncompleteActioned = incompleteFocusIds.every((id) => taskActions[id]);
  const isAllDone = incompleteFocusIds.length === 0;

  const handleAction = async (taskId: string, action: TaskAction) => {
    setTaskActions((prev) => ({ ...prev, [taskId]: action }));
    setRescheduleOpen(null);
    if (action === 'skip') {
      await onSkipTask(taskId);
    } else if (action === 'rollover') {
      onRolloverTask(taskId);
    }
  };

  const handleReschedule = async (taskId: string, date: string) => {
    setTaskActions((prev) => ({ ...prev, [taskId]: 'reschedule' }));
    setRescheduleOpen(null);
    await onRescheduleTask(taskId, date);
  };

  const handleContinue = () => {
    if (isAllDone) setShowConfetti(true);
    onComplete();
  };

  if (!isOpen) return null;

  const yesterdayStr = yesterdaySession.date;
  const total = yesterdaySession.taskIds.length;
  const completedCount = completedFocusIds.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <>
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}

      <div className="fixed inset-0 z-[199] bg-black/50 backdrop-blur-[2px]" />

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="fixed inset-x-0 bottom-0 z-[200] bg-elevated rounded-t-[20px] flex flex-col shadow-elevation-3 animate-in slide-in-from-bottom duration-300 max-h-[90vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-border-subtle">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-fg-primary">Yesterday's wrap-up</h2>
              <p className="text-xs text-fg-tertiary mt-1">{formatDateLabel(yesterdayStr)}</p>
            </div>
            {/* Progress fraction */}
            <div className={`flex flex-col items-center flex-shrink-0 px-3 py-2 rounded-xl ${isAllDone ? 'bg-success/10' : 'bg-surface-muted'}`}>
              <span className={`text-2xl font-bold leading-none ${isAllDone ? 'text-success' : 'text-fg-primary'}`}>
                {completedCount}<span className="text-base font-medium text-fg-tertiary">/{total}</span>
              </span>
              <span className="text-[10px] text-fg-tertiary uppercase tracking-wider mt-1">done</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isAllDone ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* All done celebration */}
          {isAllDone && (
            <div className="flex flex-col items-center text-center py-4 gap-2">
              <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
                <LuZap size={22} className="text-success" />
              </div>
              <p className="text-sm font-semibold text-fg-primary">You crushed it! 🎉</p>
              <p className="text-xs text-fg-secondary">All focus tasks completed yesterday.</p>
            </div>
          )}

          {/* Completed tasks (muted, visual closure) */}
          {completedFocusIds.length > 0 && !isAllDone && (
            <div>
              <p className="text-xs font-medium text-fg-tertiary uppercase tracking-wider mb-2">Completed</p>
              <div className="space-y-1.5">
                {completedFocusIds.map((id) => (
                  <div key={id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-muted/60">
                    <div className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                      <LuCheck size={9} className="text-success" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-fg-tertiary line-through truncate">{getTaskText(id)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incomplete tasks with action chips */}
          {incompleteFocusIds.length > 0 && (
            <div>
              <p className="text-xs font-medium text-fg-tertiary uppercase tracking-wider mb-2">Carry forward</p>
              <div className="space-y-3">
                {incompleteFocusIds.map((id) => {
                  const action = taskActions[id];
                  return (
                    <div key={id} className={`rounded-xl border transition-all ${action ? 'border-success/20 bg-success/5' : 'border-border-subtle bg-surface-muted'}`}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="w-4 h-4 rounded-full border-2 border-border-muted flex-shrink-0" />
                        <span className="text-sm text-fg-primary truncate flex-1">{getTaskText(id)}</span>
                        {action && (
                          <LuCheck size={14} className="text-success flex-shrink-0" />
                        )}
                      </div>

                      {!action && (
                        <div className="px-3 pb-2.5 flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleAction(id, 'rollover')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                          >
                            <LuArrowRight size={11} />
                            Roll over
                          </button>
                          <button
                            onClick={() => handleAction(id, 'skip')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-muted text-fg-secondary hover:bg-border-subtle transition-colors"
                          >
                            <LuX size={11} />
                            Skip it
                          </button>
                          <button
                            onClick={() => setRescheduleOpen(rescheduleOpen === id ? null : id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-muted text-fg-secondary hover:bg-border-subtle transition-colors"
                          >
                            <LuCalendar size={11} />
                            Reschedule
                          </button>
                        </div>
                      )}

                      {/* Reschedule quick-pick */}
                      {rescheduleOpen === id && (
                        <div className="px-3 pb-3 flex gap-2 flex-wrap border-t border-border-subtle pt-2">
                          <button
                            onClick={() => handleReschedule(id, todayStr)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
                          >
                            Today
                          </button>
                          <button
                            onClick={() => handleReschedule(id, getTomorrow(todayStr))}
                            className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-muted text-fg-secondary hover:bg-border-subtle transition-colors"
                          >
                            Tomorrow
                          </button>
                          <button
                            onClick={() => handleReschedule(id, getNextWeek(todayStr))}
                            className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-muted text-fg-secondary hover:bg-border-subtle transition-colors"
                          >
                            Next week
                          </button>
                        </div>
                      )}

                      {action && (
                        <div className="px-3 pb-2 text-xs text-fg-tertiary">
                          {action === 'rollover' && 'Kept in today\'s list'}
                          {action === 'skip' && 'Skipped'}
                          {action === 'reschedule' && 'Rescheduled'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-4 border-t border-border-subtle flex flex-col gap-2">
          <button
            onClick={handleContinue}
            disabled={!isAllDone && !allIncompleteActioned}
            className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              isAllDone || allIncompleteActioned
                ? 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98]'
                : 'bg-surface-muted text-fg-tertiary cursor-not-allowed'
            }`}
          >
            Continue to today's focus
            <LuArrowRight size={15} />
          </button>
          <button
            onClick={onSkip}
            className="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors py-1 text-center"
          >
            Skip recap
          </button>
        </div>
      </div>
    </>
  );
}
