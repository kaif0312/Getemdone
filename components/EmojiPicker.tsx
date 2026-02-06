'use client';

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
        className="fixed inset-0 z-[99998]" 
        onClick={onClose}
      />
      
      {/* Emoji Picker Wrapper - portal-like positioning */}
      <div className="fixed inset-0 z-[99999] pointer-events-none">
        <div className="relative w-full h-full">
          {/* Emoji Picker - fixed position at bottom-right, mobile-friendly */}
          <div 
            className="absolute bottom-20 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 p-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200"
          >
            {/* 2x4 Grid Layout */}
            <div className="grid grid-cols-4 gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  className="w-12 h-12 flex items-center justify-center text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors active:scale-95 min-w-[44px] min-h-[44px]"
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
