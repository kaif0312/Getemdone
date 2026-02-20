'use client';

import { useRef, useEffect } from 'react';
import { FaBell, FaQuestionCircle, FaTrash, FaShieldAlt, FaWhatsapp, FaDatabase, FaLightbulb, FaLock } from 'react-icons/fa';
import StorageUsage from './StorageUsage';
import { useEncryption } from '@/hooks/useEncryption';
import { E2EE_ENABLED } from '@/lib/config';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationSettings: () => void;
  onHelp: () => void;
  onRecycleBin: () => void;
  onAdmin?: () => void;
  onWhatsAppShare: () => void;
  onFeedback: () => void;
  deletedCount: number;
  isAdmin: boolean;
  notificationPermission: NotificationPermission;
  userId: string;
  storageUsed?: number;
  storageLimit?: number;
}

export default function SettingsMenu({
  isOpen,
  onClose,
  onNotificationSettings,
  onHelp,
  onRecycleBin,
  onAdmin,
  onWhatsAppShare,
  onFeedback,
  deletedCount,
  isAdmin,
  notificationPermission,
  userId,
  storageUsed = 0,
  storageLimit,
}: SettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { isInitialized: encryptionInitialized, masterKey } = useEncryption();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleItemClick = (action: () => void) => {
    action();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - mobile */}
      <div
        className="fixed inset-0 z-[98] bg-black/40 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal / Sheet */}
      <div
        ref={menuRef}
        className="fixed inset-x-4 bottom-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[min(400px,calc(100vw-2rem))] z-[99] md:rounded-2xl rounded-2xl bg-surface shadow-elevation-3 border border-border-subtle overflow-hidden animate-in md:zoom-in-95 fade-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-150 max-h-[85vh] flex flex-col"
      >
        <div className="flex flex-col max-h-[85vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
            <h2 className="text-lg font-semibold text-fg-primary">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg hover:bg-surface-muted text-fg-tertiary hover:text-fg-primary transition-colors"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto py-2 flex-1 min-h-0">
            {/* Security & Privacy - E2EE Status */}
            <div className={`px-4 py-3 border-b border-border-subtle ${E2EE_ENABLED ? 'bg-success/15' : 'bg-surface-muted/50'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="relative">
                    <FaLock size={20} className={E2EE_ENABLED ? 'text-success' : 'text-fg-tertiary'} />
                    {E2EE_ENABLED && encryptionInitialized && masterKey && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-success rounded-full border-2 border-surface"></span>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-fg-primary">
                      End-to-End Encrypted
                    </span>
                    {!E2EE_ENABLED ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-fg-tertiary/20 text-fg-tertiary">
                        Disabled
                      </span>
                    ) : encryptionInitialized && masterKey ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-fg-secondary">
                        Initializing...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-fg-secondary leading-relaxed">
                    {E2EE_ENABLED
                      ? 'Your tasks, comments, and messages are encrypted. Only you and your friends can read them.'
                      : 'E2EE is disabled. New data is stored in plaintext. Existing encrypted data remains readable.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-fg-tertiary">
                      <FaLock size={8} />
                      AES-256-GCM
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-fg-tertiary">
                      <FaShieldAlt size={8} />
                      E2EE
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-fg-tertiary">
                      <FaDatabase size={8} />
                      Encrypted at rest
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Storage Usage - Non-clickable display */}
            <div className="px-4 py-3 border-b border-border-subtle">
              <StorageUsage
                userId={userId}
                initialUsage={storageUsed}
                limit={storageLimit}
                compact={false}
              />
            </div>

            {/* Notification Settings */}
            <button
              onClick={() => handleItemClick(onNotificationSettings)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors text-left group"
            >
              <div className="relative">
                <FaBell size={18} className="text-primary" />
                {notificationPermission !== 'granted' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-error rounded-full"></span>
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-fg-secondary group-hover:text-fg-primary">
                  Notification Settings
                </div>
                <div className="text-xs text-fg-tertiary">
                  {notificationPermission === 'granted' ? 'Enabled' : 'Not enabled'}
                </div>
              </div>
            </button>

            {/* Help & Tips */}
            <button
              onClick={() => handleItemClick(onHelp)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors text-left group"
            >
              <FaQuestionCircle size={18} className="text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium text-fg-secondary group-hover:text-fg-primary">
                  Help & Tips
                </div>
                <div className="text-xs text-fg-tertiary">
                  Learn how to use features
                </div>
              </div>
            </button>

            {/* Recycle Bin */}
            <button
              onClick={() => handleItemClick(onRecycleBin)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors text-left group"
            >
              <div className="relative">
                <FaTrash size={18} className="text-error" />
                {deletedCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 bg-error text-on-accent text-xs font-bold rounded-full flex items-center justify-center px-1">
                    {deletedCount}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-fg-secondary group-hover:text-fg-primary">
                  Recycle Bin
                </div>
                <div className="text-xs text-fg-tertiary">
                  {deletedCount > 0 ? `${deletedCount} deleted task${deletedCount !== 1 ? 's' : ''}` : 'No deleted tasks'}
                </div>
              </div>
            </button>

            {/* WhatsApp Share */}
            <button
              onClick={() => handleItemClick(onWhatsAppShare)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors text-left group"
            >
              <FaWhatsapp size={18} className="text-success" />
              <div className="flex-1">
                <div className="text-sm font-medium text-fg-secondary group-hover:text-fg-primary">
                  Share to WhatsApp
                </div>
                <div className="text-xs text-fg-tertiary">
                  Share your tasks
                </div>
              </div>
            </button>

            {/* Feedback & Feature Requests */}
            <button
              onClick={() => handleItemClick(onFeedback)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors text-left group"
            >
              <FaLightbulb size={18} className="text-warning" />
              <div className="flex-1">
                <div className="text-sm font-medium text-fg-secondary group-hover:text-fg-primary">
                  Feedback & Ideas
                </div>
                <div className="text-xs text-fg-tertiary">
                  Report bugs or suggest features
                </div>
              </div>
            </button>

            {/* Admin Dashboard (only if admin) */}
            {isAdmin && onAdmin && (
              <>
                <div className="border-t border-border-subtle my-2"></div>
                <button
                  onClick={() => handleItemClick(onAdmin)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors text-left group"
                >
                  <FaShieldAlt size={18} className="text-primary" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-fg-secondary group-hover:text-fg-primary">
                      Admin Dashboard
                    </div>
                    <div className="text-xs text-fg-tertiary">
                      Manage users & settings
                    </div>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
