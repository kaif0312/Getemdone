'use client';

import { useEffect, useState, useRef } from 'react';
import { LuScanFace } from 'react-icons/lu';
import { NudgeIcon } from '@/components/NudgeLogo';
import { useBiometric } from '@/contexts/BiometricContext';

export default function FaceIDLockScreen() {
  const {
    verify,
    unlockWithPassword,
    unlock,
    status,
    errorMessage,
  } = useBiometric();
  const hasTriggeredUnlock = useRef(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Auto-trigger Face ID on load
  useEffect(() => {
    if (status === 'idle' || status === 'cancelled' || status === 'failed' || status === 'timeout') {
      verify();
    }
  }, []); // Only on mount - verify() is stable via useCallback

  const handleTap = () => {
    if (showPasswordInput) return;
    setShowPasswordInput(false);
    verify();
  };

  const handleUsePassword = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPasswordInput(true);
    setPassword('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setPasswordLoading(true);
    try {
      const ok = await unlockWithPassword(password);
      if (ok) {
        setShowPasswordInput(false);
        setPassword('');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const showError =
    status === 'failed' || status === 'timeout' || status === 'unavailable';
  const isVerifying = status === 'verifying';

  // On success: fade out 200ms, then unlock
  useEffect(() => {
    if (status !== 'success' || hasTriggeredUnlock.current) return;
    hasTriggeredUnlock.current = true;
    const t = setTimeout(() => {
      unlock();
    }, 200);
    return () => clearTimeout(t);
  }, [status, unlock]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-200 ${
        status === 'success' ? 'opacity-0' : ''
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <button
        type="button"
        onClick={handleTap}
        className="w-full h-full flex flex-col items-center justify-center gap-6 px-6 focus:outline-none"
        disabled={showPasswordInput}
      >
        {/* Logo + Nudge */}
        <div className="flex flex-col items-center gap-4">
          <NudgeIcon size={56} />
          <h1 className="text-[24px] font-bold text-fg-primary">Nudge</h1>
        </div>

        {/* Scan face icon with pulse */}
        <div
          className={`flex items-center justify-center ${isVerifying ? 'animate-nudge-pulse' : ''}`}
          style={{ opacity: 0.4 }}
        >
          <LuScanFace size={48} className="text-primary" strokeWidth={1.5} />
        </div>

        <p className="text-[14px] text-fg-secondary">Tap to unlock with Face ID</p>

        {/* Error state */}
        {showError && errorMessage && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <p className="text-[14px] text-error">{errorMessage}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                verify();
              }}
              className="px-6 py-2.5 rounded-full bg-primary text-on-accent font-medium text-[14px] hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Use Password link */}
        {!showPasswordInput && (
          <button
            type="button"
            onClick={handleUsePassword}
            className="mt-2 text-[14px] text-primary hover:underline focus:outline-none"
          >
            Use Password
          </button>
        )}
      </button>

      {/* Password input overlay */}
      {showPasswordInput && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-background px-6"
          role="dialog"
          aria-label="Unlock with password"
        >
          <form onSubmit={handlePasswordSubmit} className="w-full max-w-[280px] space-y-4">
            <label htmlFor="faceid-password" className="block text-[14px] text-fg-secondary mb-2">
              Enter your password to unlock
            </label>
            <input
              id="faceid-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-[10px] bg-surface border border-border-subtle text-fg-primary placeholder:text-fg-tertiary focus:outline-none focus:border-primary transition-colors text-[15px]"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPasswordInput(false)}
                className="flex-1 py-2.5 rounded-lg border border-border-subtle text-fg-primary text-[14px] font-medium hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!password.trim() || passwordLoading}
                className="flex-1 py-2.5 rounded-full bg-primary text-on-accent font-medium text-[14px] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {passwordLoading ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
