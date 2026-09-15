import type { SelectHTMLAttributes } from 'react';
import { BASE_CONTROL_CLASSES } from './Input';

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${BASE_CONTROL_CLASSES} ${className}`} {...rest}>
      {children}
    </select>
  );
}
