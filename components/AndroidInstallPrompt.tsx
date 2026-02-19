'use client';

import { useState, useEffect } from 'react';
import { LuX, LuMenu, LuSmartphone, LuCheck } from 'react-icons/lu';
import { NudgeIcon } from '@/components/NudgeLogo';

interface AndroidInstallPromptProps {
  onDismiss?: () => void;
  allowDismiss?: boolean; // If false, user MUST install to continue
  onFeedback?: () => void; // Callback to open feedback modal
}

export default function AndroidInstallPrompt({ onDismiss, allowDismiss = false, onFeedback }: AndroidInstallPromptProps) {
  const [currentStep, setCurrentStep] = useState(1);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const stepCardClass = (step: number) =>
    `flex items-start gap-3 p-4 rounded-xl transition-all cursor-pointer bg-surface border
     ${currentStep === step ? 'border-primary border-[1.5px]' : 'border-border-subtle'}
     hover:border-border-emphasized`;

  const stepNumClass = (step: number) =>
    `flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-semibold text-[12px]
     ${currentStep === step ? 'bg-primary text-on-accent' : 'bg-primary/15 text-primary'}`;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-background"
      style={{
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        height: '100dvh',
      } as React.CSSProperties}
    >
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="bg-surface rounded-2xl shadow-elevation-2 max-w-md w-full p-6 md:p-8 relative border border-border-subtle my-8">
          {/* Close button (only if dismissable) */}
          {allowDismiss && onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 text-fg-tertiary hover:text-fg-primary transition-colors z-10"
              aria-label="Close"
            >
              <LuX className="w-6 h-6" />
            </button>
          )}

          {/* Content */}
          <div className="relative z-10">
            {/* App Icon */}
            <div className="flex justify-center mb-4">
              <NudgeIcon size={56} />
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-bold text-fg-primary text-center mb-2">
              Install Nudge
            </h1>

            <p className="text-sm md:text-base text-fg-secondary text-center mb-6">
              To use Nudge on Android, install it as an app for instant notifications and offline access.
            </p>

            {/* Steps */}
            <div className="space-y-2 mb-6">
              {/* Step 1 */}
              <div className={stepCardClass(1)} onClick={() => setCurrentStep(1)}>
                <div className={stepNumClass(1)}>1</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-fg-primary mb-0.5">
                    Tap the Menu button
                  </p>
                  <div className="flex items-center gap-2 text-[13px] text-fg-secondary flex-wrap">
                    <span>Look for</span>
                    <div className="inline-flex items-center justify-center p-1.5 rounded-lg bg-surface-muted">
                      <LuMenu size={16} className="text-fg-secondary" />
                    </div>
                    <span>in the browser toolbar</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className={stepCardClass(2)} onClick={() => setCurrentStep(2)}>
                <div className={stepNumClass(2)}>2</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-fg-primary mb-0.5">
                    Select &quot;Install app&quot; or &quot;Add to Home screen&quot;
                  </p>
                  <div className="flex items-center gap-2 text-[13px] text-fg-secondary">
                    <LuSmartphone size={16} className="text-fg-secondary flex-shrink-0" />
                    <span>Look for this option in the menu</span>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className={stepCardClass(3)} onClick={() => setCurrentStep(3)}>
                <div className={stepNumClass(3)}>3</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-fg-primary mb-0.5">
                    Tap &quot;Install&quot; or &quot;Add&quot;
                  </p>
                  <div className="flex items-center gap-2 text-[13px] text-fg-secondary">
                    <LuCheck size={16} className="text-fg-secondary flex-shrink-0" />
                    <span>Confirm to add the app to your home screen</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Why install? */}
            <div className="bg-surface rounded-xl p-4 mb-6 border border-border-subtle">
              <p className="text-[14px] font-semibold text-fg-primary mb-3">Why install?</p>
              <ul className="text-[13px] text-fg-secondary space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <span><strong className="font-semibold text-fg-primary">Push notifications</strong> keep you accountable with your friends.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <span><strong className="font-semibold text-fg-primary">Faster performance</strong> with offline support.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <span><strong className="font-semibold text-fg-primary">Full-screen experience</strong> without browser UI.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <span><strong className="font-semibold text-fg-primary">Quick access</strong> from your home screen.</span>
                </li>
              </ul>
            </div>

            {/* Feedback link */}
            {onFeedback && (
              <button
                onClick={onFeedback}
                className="w-full text-[13px] text-primary font-medium text-center mt-4 hover:underline transition-colors"
              >
                Having trouble? Send feedback
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
