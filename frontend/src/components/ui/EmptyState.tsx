import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-slate-300 bg-white p-8">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="text-sm text-slate-600">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
