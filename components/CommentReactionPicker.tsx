'use client';

import { useState, useRef, useEffect } from 'react';

interface CommentReactionPickerProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

// WhatsApp-style emoji reactions
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function CommentReactionPicker({
  isOpen,
  position,
  onSelectEmoji,
  onClose,
}: CommentReactionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const emojiRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(null);
      setTouchPosition(null);
      return;
    }

    // Reset on open
    setSelectedIndex(null);
    setTouchPosition(null);
  }, [isOpen]);

  // Handle touch/mouse move to select emoji
  useEffect(() => {
    if (!isOpen || !touchPosition || !pickerRef.current) return;

    const handleMove = (clientX: number, clientY: number) => {
      const pickerRect = pickerRef.current?.getBoundingClientRect();
      if (!pickerRect) return;

      // Calculate relative position
      const relativeX = clientX - pickerRect.left;
      const relativeY = clientY - pickerRect.top;

      // Check which emoji is under the touch
      emojiRefs.current.forEach((emojiEl, index) => {
        if (!emojiEl) return;
        const emojiRect = emojiEl.getBoundingClientRect();
        const pickerRect = pickerRef.current?.getBoundingClientRect();
        if (!pickerRect) return;

        const emojiRelativeX = emojiRect.left - pickerRect.left;
        const emojiRelativeY = emojiRect.top - pickerRect.top;
        const emojiWidth = emojiRect.width;
        const emojiHeight = emojiRect.height;

        // Check if touch is within emoji bounds
        if (
          relativeX >= emojiRelativeX &&
          relativeX <= emojiRelativeX + emojiWidth &&
          relativeY >= emojiRelativeY &&
          relativeY <= emojiRelativeY + emojiHeight
        ) {
          setSelectedIndex(index);
        }
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isOpen, touchPosition]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    setTouchPosition({ x: touch.clientX, y: touch.clientY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setTouchPosition({ x: e.clientX, y: e.clientY });
  };

  const handleEnd = () => {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < EMOJIS.length) {
      onSelectEmoji(EMOJIS[selectedIndex]);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to capture touch events */}
      <div
        className="fixed inset-0 z-[200]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
      />
      
      {/* Emoji Picker */}
      <div
        ref={pickerRef}
        className="fixed z-[201] bg-white dark:bg-gray-800 rounded-full shadow-2xl border border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1 pointer-events-none"
        style={{
          left: `${position.x}px`,
          top: `${position.y - 80}px`, // Position above the touch point
          transform: 'translateX(-50%)',
        }}
      >
        {EMOJIS.map((emoji, index) => (
          <button
            key={emoji}
            ref={(el) => {
              emojiRefs.current[index] = el;
            }}
            className={`
              w-12 h-12 rounded-full flex items-center justify-center text-2xl
              transition-all duration-150 pointer-events-auto
              ${selectedIndex === index
                ? 'scale-150 bg-gray-100 dark:bg-gray-700 shadow-lg z-10'
                : 'scale-100 hover:scale-110'
              }
            `}
            onTouchStart={(e) => {
              e.preventDefault();
              setSelectedIndex(index);
            }}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={(e) => {
              e.preventDefault();
              onSelectEmoji(emoji);
              onClose();
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
