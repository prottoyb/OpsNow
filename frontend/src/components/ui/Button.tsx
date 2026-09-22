import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-400 focus-visible:outline-brand-700',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400 focus-visible:outline-slate-900',
  danger:
    'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300 focus-visible:outline-red-700',
  ghost:
    'bg-transparent text-slate-700 underline hover:text-slate-900 focus-visible:outline-slate-900',
};

/**
 * The primary button's visual treatment, exported for the handful of
 * router `<Link>` elements styled as a primary call-to-action (e.g. "New
 * ticket") — a `<Link>` cannot render as a `<button>`, so it can't use
 * `Button` directly, but it must not drift from the same brand treatment.
 */
export const PRIMARY_LINK_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/**
 * A real <button>. `type` defaults to "button" so a control inside a form
 * never submits it by accident.
 */
export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
