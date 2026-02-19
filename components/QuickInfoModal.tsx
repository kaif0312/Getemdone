'use client';

import { useState, useEffect } from 'react';
import { LuX, LuSparkles, LuWrench, LuHeart } from 'react-icons/lu';
import { NudgeIcon } from '@/components/NudgeLogo';

interface QuickInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UpdateItem {
  type: 'feature' | 'fix';
  text: string;
}

interface VersionGroup {
  version: string;
  date: string;
  items: UpdateItem[];
}

const UPDATES: VersionGroup[] = [
  {
    version: '1.0.0',
    date: 'Feb 2026',
    items: [
      { type: 'feature', text: 'Friend comment notifications' },
      { type: 'feature', text: 'Bug reporting with screenshots' },
      { type: 'feature', text: 'Media attachments (images/PDFs)' },
      { type: 'feature', text: 'Profile picture uploads' },
      { type: 'feature', text: 'Storage management (100MB/user)' },
      { type: 'fix', text: 'Fixed storage usage real-time updates' },
      { type: 'fix', text: 'Fixed PDF delete button visibility' },
      { type: 'fix', text: 'Improved mobile button sizes' },
    ],
  },
];

export default function QuickInfoModal({ isOpen, onClose }: QuickInfoModalProps) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isOpen) setIsClosing(false);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 150);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] transition-opacity duration-150 ${
          isClosing ? 'opacity-0' : 'animate-quick-info-backdrop-in'
        }`}
        style={{
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal - Centered */}
      <div
        className={`fixed left-1/2 top-1/2 z-[9999] ${
          isClosing ? 'animate-quick-info-modal-out' : 'animate-quick-info-modal-in'
        }`}
        style={{
          width: 'min(360px, calc(100vw - 32px))',
          maxHeight: '70vh',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div className="bg-elevated rounded-2xl border border-border-subtle overflow-hidden flex flex-col max-h-[70vh]">
          <div className="p-6 overflow-y-auto subtask-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <NudgeIcon size={32} />
                <h3 className="text-[18px] font-semibold text-fg-primary">Nudge</h3>
              </div>
              <button
                onClick={handleClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 text-fg-secondary hover:text-fg-primary transition-colors rounded-lg hover:bg-surface-muted"
                aria-label="Close"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Made with love */}
            <div className="text-[13px] text-fg-secondary mb-4 pb-4 border-b border-border-subtle">
              Made with <LuHeart size={14} className="inline text-error align-middle" /> by{' '}
              <span className="font-semibold text-fg-primary">Kaifuten</span> · v1.0.0
            </div>

            {/* Recent Updates */}
            <div className="text-[11px] text-fg-tertiary uppercase tracking-[0.08em] font-medium mb-3">
              Recent Updates
            </div>

            <div className="space-y-1">
              {UPDATES.map((group) => (
                <div key={group.version} className="mb-4 last:mb-0">
                  <div className="text-[12px] text-fg-secondary font-medium mb-2">
                    v{group.version} — {group.date}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 min-h-[36px]"
                      >
                        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                          {item.type === 'feature' ? (
                            <LuSparkles size={16} className="text-success" />
                          ) : (
                            <LuWrench size={16} className="text-warning" />
                          )}
                        </div>
                        <span className="text-[14px] text-fg-primary">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-border-subtle text-center">
              <p className="text-[12px] text-fg-tertiary">
                © {new Date().getFullYear()} Nudge. Built with Next.js & Firebase
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
