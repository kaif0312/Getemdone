'use client';

import { FaTimes, FaRocket, FaBug, FaHeart } from 'react-icons/fa';

interface QuickInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickInfoModal({ isOpen, onClose }: QuickInfoModalProps) {
  if (!isOpen) return null;

  const updates = [
    { type: 'feature', text: 'Friend comment notifications', version: '1.0.0' },
    { type: 'feature', text: 'Bug reporting with screenshots', version: '1.0.0' },
    { type: 'feature', text: 'Media attachments (images/PDFs)', version: '1.0.0' },
    { type: 'feature', text: 'Profile picture uploads', version: '1.0.0' },
    { type: 'feature', text: 'Storage management (100MB/user)', version: '1.0.0' },
    { type: 'fix', text: 'Fixed storage usage real-time updates', version: '1.0.0' },
    { type: 'fix', text: 'Fixed PDF delete button visibility', version: '1.0.0' },
    { type: 'fix', text: 'Improved mobile button sizes', version: '1.0.0' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal - Small and Compact */}
      <div className="fixed top-16 left-4 right-4 md:left-auto md:right-auto md:top-20 md:left-1/2 md:-translate-x-1/2 md:w-96 z-50 animate-in slide-in-from-top-2 duration-200">
        <div className="bg-surface rounded-xl shadow-elevation-3 border border-border-subtle overflow-hidden">
          {/* Header - Minimal */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-muted">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 512 512" className="text-on-accent">
                  <path d="M140 250 L220 330 L380 170" stroke="currentColor" strokeWidth="40" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-sm font-bold text-fg-primary">GetDone</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-surface-muted rounded transition-colors"
            >
              <FaTimes className="text-fg-tertiary" size={14} />
            </button>
          </div>

          {/* Created By - Very Compact */}
          <div className="px-4 py-3 text-center text-xs text-fg-secondary border-b border-border-subtle">
            Made with <FaHeart className="inline text-error text-xs" /> by <span className="font-semibold text-fg-primary">Kaifuten</span> • v1.0.0
          </div>

          {/* Updates List - Compact */}
          <div className="max-h-64 overflow-y-auto">
            <div className="px-4 py-2 text-xs font-semibold text-fg-tertiary uppercase tracking-wide bg-surface-muted">
              Recent Updates
            </div>
            <div className="divide-y divide-border-subtle">
              {updates.map((update, idx) => (
                <div key={idx} className="px-4 py-2 hover:bg-surface-muted transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      {update.type === 'feature' ? (
                        <FaRocket className="text-success" size={12} />
                      ) : (
                        <FaBug className="text-warning" size={12} />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-fg-secondary">
                        {update.text}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 text-center text-xs text-fg-tertiary bg-surface-muted">
            © {new Date().getFullYear()} GetDone. Built with Next.js & Firebase
          </div>
        </div>
      </div>
    </>
  );
}
