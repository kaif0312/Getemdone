'use client';

import { useState } from 'react';
import { FaTimes, FaFire, FaRocket, FaStar, FaHeart, FaBolt } from 'react-icons/fa';
import { LuLightbulb } from 'react-icons/lu';

interface EncouragementModalProps {
  isOpen: boolean;
  onClose: () => void;
  friendName: string;
  onSend: (message: string) => Promise<void>;
}

const ENCOURAGEMENT_MESSAGES = [
  { icon: FaFire, text: "You've got this! Keep pushing! 🔥", emoji: "🔥" },
  { icon: FaRocket, text: "Let's crush these tasks together! 🚀", emoji: "🚀" },
  { icon: FaStar, text: "You're doing amazing! Keep it up! ⭐", emoji: "⭐" },
  { icon: FaBolt, text: "Stay focused, you're unstoppable! ⚡", emoji: "⚡" },
  { icon: FaHeart, text: "Believe in yourself, you can do this! 💪", emoji: "💪" },
  { icon: FaRocket, text: "One step at a time, you're making progress! 🎯", emoji: "🎯" },
];

export default function EncouragementModal({ isOpen, onClose, friendName, onSend }: EncouragementModalProps) {
  const [sending, setSending] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  if (!isOpen) return null;

  const handleSendQuick = async (message: string) => {
    setSending(true);
    try {
      await onSend(message);
      onClose();
    } catch (error) {
      console.error('Error sending encouragement:', error);
    } finally {
      setSending(false);
    }
  };

  const handleSendCustom = async () => {
    if (!customMessage.trim()) return;
    setSending(true);
    try {
      await onSend(customMessage);
      setCustomMessage('');
      onClose();
    } catch (error) {
      console.error('Error sending encouragement:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal - max-h ensures bottom stays visible on PC when content is tall */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:max-h-[90vh] z-50 animate-in zoom-in-95 duration-200 flex flex-col">
        <div className="bg-surface rounded-2xl shadow-elevation-3 border border-border-subtle overflow-hidden h-full md:max-h-[90vh] flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-gray-700 dark:to-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <FaFire className="text-white" size={16} />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Encourage {friendName}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              disabled={sending}
            >
              <FaTimes className="text-gray-500 dark:text-gray-400" size={16} />
            </button>
          </div>

          {/* Content - min-h-0 lets flex shrink so footer stays visible on PC */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {/* Quick Messages */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Quick Messages
              </p>
              <div className="space-y-2">
                {ENCOURAGEMENT_MESSAGES.map((msg, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendQuick(msg.text)}
                    disabled={sending}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {msg.emoji}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-200 flex-1">
                      {msg.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Message */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Custom Message
              </p>
              <div className="space-y-2">
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Type your own words of encouragement..."
                  disabled={sending}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
                  rows={3}
                  maxLength={200}
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {customMessage.length}/200
                  </span>
                  <button
                    onClick={handleSendCustom}
                    disabled={!customMessage.trim() || sending}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {sending ? 'Sending...' : 'Send 📨'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Tip */}
          <div className="px-4 py-3 bg-surface-muted border-t border-border-subtle">
            <p className="text-xs text-fg-tertiary text-center flex items-center justify-center gap-1.5">
              <LuLightbulb size={16} className="flex-shrink-0" />
              Your friend will receive an instant notification!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
