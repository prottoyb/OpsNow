import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400 focus-visible:outline-slate-900',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400 focus-visible:outline-slate-900',
  danger:
    'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300 focus-visible:outline-red-700',
  ghost:
    'bg-transparent text-slate-700 underline hover:text-slate-900 focus-visible:outline-slate-900',
};

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
