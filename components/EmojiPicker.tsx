'use client';

import { useState } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: 'top' | 'bottom';
}

const EMOJI_OPTIONS = ['👏', '🎉', '💪', '🔥', '❤️', '⭐', '✨', '👍'];

export default function EmojiPicker({ onSelect, onClose, position = 'top' }: EmojiPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Emoji Picker */}
      <div 
        className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} left-0 bg-white rounded-lg shadow-2xl border border-gray-200 p-2 flex gap-1 z-50 animate-in fade-in zoom-in duration-150`}
      >
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-100 rounded-lg transition-colors active:scale-95"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
