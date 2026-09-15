import { Button } from './Button';

export interface ErrorStateProps {
  title: string;
  messages: string[];
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * `role="alert"` so the failure is announced when it appears mid-page.
 * Messages are rendered as text nodes — a 400 from class-validator arrives
 * as a list and is shown as a list.
 */
export function ErrorState({
  title,
  messages,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4"
    >
      <div>
        <p className="text-sm font-semibold text-red-900">{title}</p>
        {messages.length === 1 ? (
          <p className="mt-1 text-sm text-red-900">{messages[0]}</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A non-blocking inline notice for a recoverable problem (403/409) or a
 * success confirmation, where the page itself remains usable.
 *
 * This deliberately carries no `aria-live` of its own: it is mounted and
 * unmounted as notices come and go, and a live region only announces changes
 * that happen while it is already in the DOM. The caller owns a permanently
 * rendered live region and swaps this component inside it.
 */
export function InlineNotice({
  tone = 'warning',
  children,
}: {
  tone?: 'warning' | 'success';
  children: React.ReactNode;
}) {
  const classes =
    tone === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-amber-300 bg-amber-50 text-amber-900';
  return (
    <p className={`rounded-md border p-3 text-sm ${classes}`}>{children}</p>
  );
}
