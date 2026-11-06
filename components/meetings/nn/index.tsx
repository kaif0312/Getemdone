'use client';

// Native-look kit for the Meetings UI (scoped .nn tokens, see nn.css). Mirrors native/src/ui/*.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { nunito } from './font';
import './nn.css';

export const NN_CLASS = `nn ${nunito.variable}`;

type Tone = 'primary' | 'accent' | 'sun' | 'success' | 'danger';
const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ');

/* ---------- toast ---------- */
type ToastKind = 'success' | 'error' | 'info';
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useNnToast = () => useContext(ToastCtx);

export function NnRoot({ children, page = false }: { children: ReactNode; page?: boolean }) {
  const [toast, setToast] = useState<{ id: number; msg: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, kind: ToastKind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), msg, kind });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={show}>
      <div className={cx(NN_CLASS, page && 'nn-page')}>
        {children}
        {toast && (
          <div className="nn-toast-host" role="status" aria-live="polite">
            <div key={toast.id} className={`nn-toast nn-toast--${toast.kind}`}>{toast.msg}</div>
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- card ---------- */
export function NnCard({ tone, flat, compact, onClick, children, className, style, label }: {
  tone?: Tone; flat?: boolean; compact?: boolean; onClick?: () => void; children: ReactNode; className?: string; style?: CSSProperties; label?: string;
}) {
  const cls = cx('nn-card', tone && `nn-card--${tone}`, flat && 'nn-card--flat', compact && 'nn-card--compact', onClick && 'nn-card--press', className);
  // div[role=button], not <button>: cards hold real buttons (Join Meet) and nesting buttons is invalid HTML.
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={cls}
        style={style}
        aria-label={label}
        onClick={onClick}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      >
        {children}
      </div>
    );
  }
  return <div className={cls} style={style}>{children}</div>;
}

/* ---------- button ---------- */
type BtnVariant = 'primary' | 'accent' | 'success' | 'danger' | 'secondary' | 'ghost';
export function NnButton({ variant = 'primary', size = 'md', block, loading, dangerText, icon, children, ...rest }: {
  variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; block?: boolean; loading?: boolean; dangerText?: boolean; icon?: ReactNode; children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx('nn-btn', variant !== 'primary' && `nn-btn--${variant}`, size !== 'md' && `nn-btn--${size}`, block && 'nn-btn--block', dangerText && 'nn-btn--danger-text', rest.className)}
    >
      {loading ? <span className="nn-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function NnRoundButton({ children, label, fill, onClick }: { children: ReactNode; label: string; fill?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} className={cx('nn-round', 'nn-hit', fill && 'nn-round--fill')} onClick={onClick}>{children}</button>;
}

/* ---------- chip ---------- */
export function NnChip({ tone, selected, size = 'md', icon, onClick, children, label }: {
  tone?: 'primary' | 'accent' | 'success' | 'danger'; selected?: boolean; size?: 'sm' | 'md'; icon?: ReactNode; onClick?: () => void; children: ReactNode; label?: string;
}) {
  const cls = cx('nn-chip', size === 'sm' && 'nn-chip--sm', tone && `nn-chip--${tone}`, selected && 'nn-chip--selected');
  if (onClick) return <button type="button" className={cls} onClick={onClick} aria-pressed={selected} aria-label={label}>{icon}{children}</button>;
  return <span className={cls}>{icon}{children}</span>;
}

export const NnAvatar = ({ text, large }: { text: string; large?: boolean }) => <span className={cx('nn-avatar', large && 'nn-avatar--lg')} aria-hidden>{text}</span>;

/* ---------- section header, icon tile ---------- */
export function NnSectionHeader({ title, count, right }: { title: string; count?: number; right?: ReactNode }) {
  return (
    <div className="nn-row" style={{ justifyContent: 'space-between', minHeight: 24 }}>
      <div className="nn-row">
        <span className="nn-label nn-muted">{title}</span>
        {count !== undefined && <span className="nn-count">{count}</span>}
      </div>
      {right}
    </div>
  );
}
export const NnIconTile = ({ children, sun }: { children: ReactNode; sun?: boolean }) => <span className={cx('nn-tile', sun && 'nn-tile--sun')} aria-hidden>{children}</span>;

/* ---------- sheet ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function NnSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  const mounted = typeof document !== 'undefined'; // sheets only open client side, after a click or a deep link past the auth gate
  useEffect(() => {
    if (!mounted) return;
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('input,textarea') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; prev?.focus?.(); };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <ToastBridge>
      <div className={NN_CLASS}>
        <div className="nn-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div ref={ref} className="nn-sheet" role="dialog" aria-modal="true" aria-label={title}>
            <div className="nn-sheet-head">
              <h2 className="nn-heading">{title}</h2>
              <button type="button" className="nn-round nn-round--alt nn-hit" aria-label="Close" onClick={onClose}><LuX size={18} /></button>
            </div>
            <div className="nn-sheet-body">{children}</div>
            {footer && <div className="nn-sheet-foot">{footer}</div>}
          </div>
        </div>
      </div>
    </ToastBridge>,
    document.body,
  );
}
// Portals keep React context, so toasts raised inside a sheet still reach NnRoot; this is just a pass-through.
const ToastBridge = ({ children }: { children: ReactNode }) => <>{children}</>;

/* ---------- states ---------- */
export type StickerPose = 'sleepy' | 'disappointed' | 'cheer' | 'waiting' | 'clipboard' | 'flex' | 'proud' | 'blowing';
export function NnEmpty({ pose, title, body, compact, action }: { pose: StickerPose; title: string; body?: string; compact?: boolean; action?: ReactNode }) {
  const size = compact ? 120 : 168;
  return (
    <div className="nn-empty">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/stickers/${pose}.webp`} width={size} height={size} alt="" />
      <h3 className="nn-heading">{title}</h3>
      {body && <p className="nn-body nn-muted" style={{ maxWidth: 300 }}>{body}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
export function NnError({ title = 'That did not work.', body = 'Check your connection and try again.', onRetry }: { title?: string; body?: string; onRetry: () => void }) {
  return <NnEmpty pose="disappointed" title={title} body={body} action={<NnButton variant="secondary" onClick={onRetry}>Retry</NnButton>} />;
}
export function NnSkeletonList({ count = 3 }: { count?: number }) {
  return <div className="nn-stack" aria-busy="true" aria-label="Loading">{Array.from({ length: count }, (_, i) => <div key={i} className="nn-skeleton" />)}</div>;
}
