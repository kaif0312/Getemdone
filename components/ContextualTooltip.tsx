'use client';

import { useState, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

interface ContextualTooltipProps {
  id: string;
  message: string;
  position: 'above' | 'below' | 'tooltip' | 'inline';
  targetRef?: React.RefObject<HTMLElement | null>;
  show: boolean;
  onDismiss: () => void;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
}

export default function ContextualTooltip({
  id,
  message,
  position,
  targetRef,
  show,
  onDismiss,
  mobileOnly = false,
  desktopOnly = false,
}: ContextualTooltipProps) {
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Skip if mobile-only on desktop or desktop-only on mobile
  if ((mobileOnly && !isMobile) || (desktopOnly && isMobile)) {
    return null;
  }

  useEffect(() => {
    if (!show || !targetRef?.current || !tooltipRef.current) {
      return;
    }

    const updatePosition = () => {
      const target = targetRef.current;
      const tooltip = tooltipRef.current;
      if (!target || !tooltip) return;

      const rect = target.getBoundingClientRect();

      let top = 0;
      let left = 0;

      if (position === 'above') {
        top = rect.top - tooltip.offsetHeight - 8;
        left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
      } else if (position === 'below') {
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
      } else if (position === 'tooltip') {
        top = rect.top + rect.height / 2 - tooltip.offsetHeight / 2;
        left = rect.right + 12;
      }

      // Keep tooltip in viewport
      const padding = 16;
      if (left < padding) left = padding;
      if (left + tooltip.offsetWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltip.offsetWidth - padding;
      }
      if (top < padding) top = padding;
      if (top + tooltip.offsetHeight > window.innerHeight - padding) {
        top = window.innerHeight - tooltip.offsetHeight - padding;
      }

      setTooltipPosition(prev => {
        // Only update if position actually changed to prevent unnecessary re-renders
        if (prev.top === top && prev.left === left) return prev;
        return { top, left };
      });
    };

    // Use requestAnimationFrame to avoid layout thrashing
    const rafId = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(rafId);
  }, [show, position, targetRef]);

  if (!show) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
      }}
    >
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-xl p-3 max-w-[280px] text-sm relative">
        <button
          onClick={onDismiss}
          className="absolute -top-2 -right-2 w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 transition-colors"
          aria-label="Dismiss tip"
        >
          <FaTimes size={10} />
        </button>
        <p className="pr-6">{message}</p>
      </div>
      {/* Arrow */}
      {position === 'tooltip' && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-r-8 border-r-gray-900 dark:border-r-gray-800 border-b-8 border-b-transparent" />
      )}
    </div>
  );
}
