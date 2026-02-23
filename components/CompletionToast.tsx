'use client';

import { useEffect, useState } from 'react';

interface CompletionToastProps {
  taskId: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export default function CompletionToast({
  taskId,
  onUndo,
  onDismiss,
  duration = 5000,
}: CompletionToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const timer = setTimeout(onDismiss, duration);
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / duration) * 100));
    }, 50);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [duration, onDismiss]);

  return (
    <div
      className="fixed left-4 right-4 z-[70] flex items-center justify-between gap-3 px-4 py-3 rounded-[10px] bg-elevated border border-border-subtle shadow-elevation-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
    >
      <span className="text-[13px] text-fg-primary">
        Task completed
        <span className="text-fg-tertiary"> · </span>
        <button
          type="button"
          onClick={() => {
            onUndo();
            onDismiss();
          }}
          className="text-primary font-medium hover:underline"
        >
          Undo
        </button>
      </span>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-border-subtle rounded-b-[10px] overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
