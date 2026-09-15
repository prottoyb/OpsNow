import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-300',
  info: 'bg-sky-100 text-sky-900 ring-sky-300',
  warning: 'bg-amber-100 text-amber-900 ring-amber-300',
  success: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  danger: 'bg-red-100 text-red-900 ring-red-300',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Optional prefix read by assistive tech, e.g. "Status:". */
  srPrefix?: string;
}

/**
 * Colour is always redundant here: the badge's text label carries the full
 * meaning on its own (WCAG 1.4.1 — never convey information by colour
 * alone), and each tone additionally has a visible ring for low-colour
 * displays.
 */
export function Badge({ tone = 'neutral', children, srPrefix }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {srPrefix ? <span className="sr-only">{srPrefix} </span> : null}
      {children}
    </span>
  );
}
