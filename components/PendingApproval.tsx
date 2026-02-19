'use client';

import { useAuth } from '@/contexts/AuthContext';
import { FaClock, FaEnvelope, FaCheckCircle, FaSignOutAlt, FaArrowLeft } from 'react-icons/fa';
import { LuLightbulb } from 'react-icons/lu';

export default function PendingApproval() {
  const { user, userData, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-elevation-3 p-8 w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <FaClock className="text-primary" size={48} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-fg-primary mb-4">
          Pending Approval
        </h1>
        
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <FaCheckCircle className="text-primary" />
            <p className="text-lg font-semibold text-fg-primary">
              Your account has been created!
            </p>
          </div>
          <p className="text-sm text-fg-secondary mb-4">
            This app is currently in <strong>beta testing</strong>. Your sign-up request has been submitted and is pending admin approval.
          </p>
        </div>

        <div className="space-y-4 text-left mb-6">
          <div className="flex items-start gap-3 p-4 bg-surface-muted rounded-lg border border-border-subtle">
            <FaEnvelope className="text-fg-tertiary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-fg-primary mb-1">
                Email Notification
              </p>
              <p className="text-sm text-fg-secondary">
                We'll notify you at <strong className="text-fg-primary">{userData?.email || user?.email}</strong> once your request is approved.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-surface-muted rounded-lg border border-border-subtle">
            <FaClock className="text-fg-tertiary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-fg-primary mb-1">
                What's Next?
              </p>
              <p className="text-sm text-fg-secondary">
                You can check back later or try refreshing this page. Once approved, you'll have full access to the app!
              </p>
            </div>
          </div>
        </div>

        <div className="bg-warning-bg border border-warning-border rounded-lg p-4 mb-6">
          <p className="text-xs text-warning-text flex items-center gap-1.5">
            <LuLightbulb size={14} className="flex-shrink-0" />
            <strong>Tip:</strong> The page will automatically update when your request is approved. No need to sign out and back in!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              // Clear auth and reload to show sign up page
              signOut();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-surface-muted text-fg-secondary py-3 rounded-lg font-semibold hover:bg-surface-muted/80 transition-colors"
          >
            <FaSignOutAlt /> Sign Out
          </button>
          <button
            onClick={() => {
              // Sign out and the app will show AuthModal
              signOut();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-accent py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            <FaArrowLeft /> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
