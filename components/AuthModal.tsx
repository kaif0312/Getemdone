'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LuLock, LuEye, LuEyeOff } from 'react-icons/lu';
import { NudgeIcon } from '@/components/NudgeLogo';

export default function AuthModal() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn, signUp, signInWithGoogle } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!displayName.trim()) {
          setError('Display name is required');
          setLoading(false);
          return;
        }
        await signUp(email, password, displayName);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      if (err.message === 'ACCESS_REMOVED') return;
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err.message === 'ACCESS_REMOVED') return;
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3.5 rounded-[10px] bg-background text-[15px] text-fg-primary placeholder:text-fg-tertiary ' +
    'border-2 border-transparent focus:outline-none focus:border-primary transition-colors';

  return (
    <div className="min-h-[100dvh] min-h-[100vh] flex items-center justify-center px-6 py-8 auth-login-bg">
      <div className="w-full max-w-[400px] animate-auth-card-in">
        <div className="md:bg-surface md:rounded-2xl md:border md:border-border-subtle md:px-8 md:py-10 shadow-auth-card">
          {/* Branding */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-4">
              <NudgeIcon size={56} />
            </div>
            <h1 className="text-[32px] font-bold text-fg-primary mb-1">Nudge</h1>
            <p className="text-[14px] text-fg-secondary mb-3">Stay on track, together.</p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-elevated border border-border-subtle">
              <LuLock size={12} className="text-fg-secondary" />
              <span className="text-[12px] text-fg-secondary">Beta Testing</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-[14px]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-[13px] text-fg-secondary mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                  placeholder="Your name"
                  required={isSignUp}
                />
              </div>
            )}

            <div>
              <label className="block text-[13px] text-fg-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] text-fg-secondary mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-fg-tertiary hover:text-fg-secondary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-[10px] bg-primary text-on-accent text-[15px] font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-on-accent/30 border-t-on-accent rounded-full animate-spin" />
              ) : (
                isSignUp ? 'Sign Up' : 'Sign In'
              )}
            </button>
          </form>

          {/* OR divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-[13px] text-fg-tertiary">or</span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 rounded-[10px] bg-elevated border border-border-emphasized dark:border-border-subtle text-fg-primary text-[15px] font-medium hover:bg-surface-muted transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Sign up / Sign in link */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-[14px] text-fg-secondary hover:text-fg-primary transition-colors"
            >
              {isSignUp ? (
                <>
                  Already have an account? <span className="text-primary font-medium">Sign In</span>
                </>
              ) : (
                <>
                  Don&apos;t have an account? <span className="text-primary font-medium">Sign Up</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
