'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const CURATED_EMOJIS = [
  '📚', '💻', '🏋️', '🎵', '✍️', '🏠', '💼', '🧹', '🍳', '💊',
  '🎯', '🔬', '📧', '🛒', '💰', '📱', '🚗', '🧘', '🎨', '📖',
  '🏃', '🥗', '☕', '💡', '📝', '🗂️', '🔧', '🌸', '🐕', '👶',
];

interface EmojiTagPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  recentlyUsed: string[];
  currentTags: string[];
  maxTags?: number;
}

export default function EmojiTagPicker({
  anchorRef,
  isOpen,
  onClose,
  onSelect,
  recentlyUsed,
  currentTags,
  maxTags = 5,
}: EmojiTagPickerProps) {
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canAddMore = currentTags.length < maxTags;

  // Extract emoji from paste/text (supports Unicode emoji)
  const extractEmoji = (text: string): string | null => {
    const match = text.match(/\p{Emoji}/u);
    return match ? match[0] : null;
  };

  // Filter curated + recent by search
  const filteredRecent = recentlyUsed.filter(
    (e) => !currentTags.includes(e) && (!search || e.includes(search) || search.includes(e))
  );
  const filteredCurated = CURATED_EMOJIS.filter(
    (e) => !currentTags.includes(e) && (!search || e.includes(search) || search.includes(e))
  );

  // Handle paste in search - use first emoji found
  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    const emoji = extractEmoji(pasted);
    if (emoji && canAddMore) {
      e.preventDefault();
      onSelect(emoji);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // Focus search when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleEmojiClick = (emoji: string) => {
    if (!canAddMore) return;
    onSelect(emoji);
    onClose();
  };

  const picker = (
    <>
      <div
        className="fixed inset-0 z-[99998]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={containerRef}
        className="fixed z-[99999] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 p-3 w-[min(320px,calc(100vw-2rem))] animate-in fade-in zoom-in-95 duration-150"
        style={(() => {
          if (!anchorRef.current) return {};
          const rect = anchorRef.current.getBoundingClientRect();
          const pw = Math.min(320, window.innerWidth - 32);
          const ph = 280;
          let left = rect.left;
          if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
          if (left < 16) left = 16;
          const spaceBelow = window.innerHeight - rect.bottom - 16;
          const top = spaceBelow >= ph ? rect.bottom + 8 : rect.top - ph - 8;
          return { top, left, width: pw };
        })()}
      >
        {!canAddMore && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Max 5 tags per task
          </p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="Search or paste emoji"
          className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none mb-3"
        />
        {filteredRecent.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Recent
            </div>
            <div className="flex flex-wrap gap-1">
              {filteredRecent.slice(0, 8).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiClick(emoji)}
                  disabled={!canAddMore}
                  className="w-11 h-11 flex items-center justify-center text-2xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all min-w-[44px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Emojis
          </div>
          <div className="grid grid-cols-6 gap-1">
            {(search ? filteredCurated : CURATED_EMOJIS).map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                disabled={!canAddMore || currentTags.includes(emoji)}
                className="w-11 h-11 flex items-center justify-center text-2xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all min-w-[44px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(picker, document.body);
}
