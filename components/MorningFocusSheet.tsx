'use client';

import { useState, useRef, useCallback } from 'react';
import { Task } from '@/lib/types';
import { LuZap, LuCheck } from 'react-icons/lu';
import Confetti from './Confetti';

const MAX_FOCUS = 5;

interface MorningFocusSheetProps {
  isOpen: boolean;
  tasks: Task[];
  todayStr: string;
  onConfirm: (selectedIds: string[]) => Promise<void>;
  onSkip: () => void;
}

export default function MorningFocusSheet({
  isOpen,
  tasks,
  todayStr,
  onConfirm,
  onSkip,
}: MorningFocusSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shake, setShake] = useState(false);

  // Swipe-to-dismiss
  const startYRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const delta = e.changedTouches[0].clientY - startYRef.current;
    if (delta > 80) onSkip();
    startYRef.current = null;
  };

  const toggleTask = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= MAX_FOCUS) {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        return prev;
      }
      return new Set(prev).add(id);
    });
  }, []);

  const handleConfirm = async () => {
    if (selected.size === 0 || confirming) return;
    setConfirming(true);
    setShowConfetti(true);
    await onConfirm(Array.from(selected));
    setConfirming(false);
  };

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const candidateTasks = tasks.filter((t) => !t.deleted && !t.completed);

  return (
    <>
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}

      {/* Backdrop — intentionally non-dismissable to encourage ritual completion */}
      <div className="fixed inset-0 z-[199] bg-black/50 backdrop-blur-[2px]" />

      {/* Sheet */}
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="fixed inset-x-0 bottom-0 z-[200] bg-elevated rounded-t-[20px] flex flex-col shadow-elevation-3 animate-in slide-in-from-bottom duration-300 max-h-[90vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-border-subtle">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-fg-primary">Good morning.</h2>
              <p className="text-sm text-fg-secondary mt-0.5">What matters today?</p>
              <p className="text-xs text-fg-tertiary mt-1">{formatDate(todayStr)}</p>
            </div>
            {/* Selection counter */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                shake ? 'focus-counter-shake' : ''
              } ${selected.size > 0 ? 'bg-primary/10 text-primary' : 'bg-surface-muted text-fg-tertiary'}`}
            >
              <LuZap size={14} />
              <span>{selected.size} / {MAX_FOCUS}</span>
            </div>
          </div>
          {selected.size >= MAX_FOCUS && (
            <p className="text-xs text-warning mt-2">Max {MAX_FOCUS} focus tasks — quality over quantity.</p>
          )}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {candidateTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-surface-muted flex items-center justify-center">
                <LuZap size={24} className="text-fg-tertiary" />
              </div>
              <p className="text-fg-secondary text-sm">No tasks yet. Add some tasks first,<br />then come back here.</p>
            </div>
          ) : (
            candidateTasks.map((task) => {
              const isSelected = selected.has(task.id);
              return (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-surface-muted hover:bg-surface-muted/80 border border-transparent'
                  }`}
                >
                  {/* Circle checkbox */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? 'bg-primary border-primary' : 'border-border-muted'
                    }`}
                  >
                    {isSelected && <LuCheck size={11} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-fg-primary'}`}>
                      {task.text}
                    </p>
                    {task.tags && task.tags.length > 0 && (
                      <p className="text-xs text-fg-tertiary mt-0.5 truncate">{task.tags.slice(0, 3).join(' ')}</p>
                    )}
                  </div>
                  {isSelected && (
                    <LuZap size={14} className="text-primary flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-4 border-t border-border-subtle flex flex-col gap-2">
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0 || confirming}
            className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all ${
              selected.size > 0 && !confirming
                ? 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98]'
                : 'bg-surface-muted text-fg-tertiary cursor-not-allowed'
            }`}
          >
            {confirming ? 'Setting focus…' : selected.size > 0 ? `Start my day →` : 'Select tasks to focus on'}
          </button>
          <button
            onClick={onSkip}
            className="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors py-1 text-center"
          >
            Skip for now
          </button>
        </div>
      </div>

    </>
  );
}
