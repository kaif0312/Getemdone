'use client';

import { FaTimes } from 'react-icons/fa';

interface FeatureBadgeProps {
  id: string;
  label: string;
  show: boolean;
  onDismiss: () => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export default function FeatureBadge({
  id,
  label,
  show,
  onDismiss,
  position = 'top-right',
}: FeatureBadgeProps) {
  if (!show) return null;

  const positionClasses = {
    'top-right': 'top-0 right-0',
    'top-left': 'top-0 left-0',
    'bottom-right': 'bottom-0 right-0',
    'bottom-left': 'bottom-0 left-0',
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} z-10 animate-in fade-in zoom-in-95 duration-200`}
    >
      <div className="relative">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1.5">
          <span>{label}</span>
          <button
            onClick={onDismiss}
            className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label="Dismiss"
          >
            <FaTimes size={8} />
          </button>
        </div>
        {/* Pulse animation */}
        <div className="absolute inset-0 bg-amber-500 rounded-full animate-ping opacity-20" />
      </div>
    </div>
  );
}
