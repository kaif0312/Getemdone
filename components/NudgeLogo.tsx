'use client';

/** Nudge [N] lettermark - primary accent square with white "N" */
export function NudgeIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`rounded-lg bg-primary flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="text-on-accent font-semibold"
        style={{
          fontSize: Math.round(size * 0.65),
          lineHeight: 1,
          fontFamily: 'var(--font-inter), -apple-system, sans-serif',
        }}
      >
        N
      </span>
    </div>
  );
}

/** Header wordmark: [N] + "udge" */
export function NudgeWordmark({ iconSize = 28, className = '' }: { iconSize?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <NudgeIcon size={iconSize} />
      <span className="text-fg-primary font-bold tracking-tight -ml-px" style={{ fontSize: 20 }}>
        udge
      </span>
    </span>
  );
}
