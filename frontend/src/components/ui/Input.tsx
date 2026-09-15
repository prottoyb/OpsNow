import type { InputHTMLAttributes } from 'react';

const BASE_CONTROL_CLASSES =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-2 focus:outline-offset-1 focus:outline-slate-900 disabled:bg-slate-100 disabled:text-slate-500';

export function Input({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE_CONTROL_CLASSES} ${className}`} {...rest} />;
}

export { BASE_CONTROL_CLASSES };
