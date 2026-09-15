import type { TextareaHTMLAttributes } from 'react';
import { BASE_CONTROL_CLASSES } from './Input';

export function Textarea({
  className = '',
  rows = 6,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={`${BASE_CONTROL_CLASSES} ${className}`}
      {...rest}
    />
  );
}
