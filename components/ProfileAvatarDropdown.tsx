'use client';

import { useState, useRef, useEffect } from 'react';
import { FaSun, FaMoon, FaCog, FaUsers, FaSignOutAlt } from 'react-icons/fa';
import { LuScanFace, LuLock } from 'react-icons/lu';
import Avatar from './Avatar';
import { getAccentForId } from '@/lib/theme';
import { useBiometric } from '@/contexts/BiometricContext';

interface ProfileAvatarDropdownProps {
  userPhotoURL?: string;
  userDisplayName: string;
  userEmail?: string;
  userId: string;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onSettings: () => void;
  onSocial: () => void;
  onLogout: () => void;
  onShowToast?: (title: string) => void;
}

export default function ProfileAvatarDropdown({
  userPhotoURL,
  userDisplayName,
  userEmail,
  userId,
  theme,
  onThemeToggle,
  onSettings,
  onSocial,
  onLogout,
  onShowToast,
}: ProfileAvatarDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [biometricToggling, setBiometricToggling] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accent = getAccentForId(userId);
  const {
    supportsBiometric,
    biometricEnabled,
    enroll,
    disable,
    lock,
  } = useBiometric();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const menuContent = (
    <div className="p-2 space-y-0.5">
      {/* Theme Toggle - label reflects CURRENT mode, toggle on right */}
      <button
        onClick={() => onThemeToggle()}
        className="w-full flex items-center justify-between gap-3 min-h-[44px] px-3 py-2 rounded-lg text-fg-primary hover:bg-surface-muted transition-colors text-left"
        type="button"
      >
        <div className="flex items-center gap-3">
          {theme === 'dark' ? (
            <FaMoon size={20} className="text-fg-secondary shrink-0" />
          ) : (
            <FaSun size={20} className="text-fg-secondary shrink-0" />
          )}
          <span className="text-[15px]">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        </div>
        <div
          role="switch"
          aria-checked={theme === 'dark'}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 border ${
            theme === 'dark' ? 'bg-primary border-primary' : 'bg-transparent border-border-subtle'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-on-accent rounded-full transition-transform ${
              theme === 'dark' ? 'left-5' : 'left-1'
            }`}
          />
        </div>
      </button>

      {/* Settings */}
      <button
        onClick={() => handleItemClick(onSettings)}
        className="w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg text-fg-primary hover:bg-surface-muted transition-colors text-left"
      >
        <FaCog size={20} className="text-fg-secondary shrink-0" />
        <span className="text-[15px]">Settings</span>
      </button>

      {/* Social / Groups / Friends */}
      <button
        onClick={() => handleItemClick(onSocial)}
        className="w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg text-fg-primary hover:bg-surface-muted transition-colors text-left"
      >
        <FaUsers size={20} className="text-fg-secondary shrink-0" />
        <span className="text-[15px]">Social / Groups / Friends</span>
      </button>

      {/* Face ID Lock - iOS only */}
      {supportsBiometric && (
        <div className="pt-1">
          <button
            onClick={async () => {
              if (biometricToggling) return;
              setBiometricToggling(true);
              if (biometricEnabled) {
                await disable();
              } else {
                const ok = await enroll();
                if (!ok && onShowToast) {
                  onShowToast('Face ID setup cancelled');
                }
              }
              setBiometricToggling(false);
            }}
            disabled={biometricToggling}
            className="w-full flex items-center justify-between gap-3 min-h-[44px] px-3 py-2 rounded-lg text-fg-primary hover:bg-surface-muted transition-colors text-left disabled:opacity-60"
            type="button"
          >
            <div className="flex items-center gap-3">
              <LuScanFace size={18} className="text-fg-secondary shrink-0" />
              <span className="text-[15px]">Face ID Lock</span>
            </div>
            <div
              role="switch"
              aria-checked={biometricEnabled}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 border ${
                biometricEnabled ? 'bg-primary border-primary' : 'bg-transparent border-border-subtle'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-on-accent rounded-full transition-transform ${
                  biometricEnabled ? 'left-5' : 'left-1'
                }`}
              />
            </div>
          </button>
          <p className="text-[12px] text-fg-tertiary px-3 pb-2">Require Face ID to open Nudge</p>
        </div>
      )}

      {/* Lock App - only when Face ID is enabled */}
      {supportsBiometric && biometricEnabled && (
        <button
          onClick={() => handleItemClick(lock)}
          className="w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg text-fg-primary hover:bg-surface-muted transition-colors text-left"
        >
          <LuLock size={18} className="text-fg-secondary shrink-0" />
          <span className="text-[15px]">Lock App</span>
        </button>
      )}

      {/* Logout - separated by divider, error color */}
      <div className="border-t border-border-subtle mt-3 pt-3">
        <button
          onClick={() => handleItemClick(onLogout)}
          className="w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg text-error hover:bg-error/10 transition-colors text-left"
        >
          <FaSignOutAlt size={20} className="shrink-0" />
          <span className="text-[15px] font-medium">Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-transparent hover:ring-border-subtle transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
        title="Profile & menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Avatar
          photoURL={userPhotoURL}
          displayName={userDisplayName}
          size="sm"
          gradientFrom={accent.from}
          gradientTo={accent.to}
          className="w-full h-full"
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop - mobile: rgba(0,0,0,0.4) + blur(4px) */}
          <div
            className="fixed inset-0 z-[98] md:hidden bg-black/40 backdrop-blur-[4px]"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          {/* Menu - dropdown on desktop (240px, 12px radius), bottom sheet on mobile */}
          <div
            className="fixed md:absolute inset-x-0 bottom-0 md:bottom-auto md:right-0 md:top-full md:mt-2 md:w-[240px] z-[99] md:rounded-xl rounded-t-2xl bg-elevated shadow-elevation-3 border border-border-subtle border-t-border-subtle overflow-hidden animate-in md:animate-in md:zoom-in-95 md:fade-in slide-in-from-bottom md:slide-in-from-top-2 duration-150 origin-bottom md:origin-top-right"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
              maxHeight: 'min(70vh, 400px)',
            }}
          >
            {/* Drag handle pill - mobile only: 36px wide, 4px tall, tertiary 30%, 8px top margin */}
            <div className="flex justify-center pt-2 pb-2 md:hidden flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" aria-hidden />
            </div>
            {/* Header - user info with 16px bottom padding, 1px separator */}
            <div className="px-3 pt-0 pb-4 mb-0 border-b border-border-subtle">
              <p className="text-sm font-semibold text-fg-primary truncate">{userDisplayName}</p>
              <p className="text-xs text-fg-tertiary truncate">{userEmail || 'Signed in'}</p>
            </div>
            <div className="px-0 pt-2">
              {menuContent}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
