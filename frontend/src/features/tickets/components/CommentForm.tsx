import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Textarea } from '../../../components/ui/Textarea';
import type { CommentVisibility } from '../../../types/api';
import { FIELD_LIMITS } from '../../../types/api';

export interface CommentFormProps {
  /** Staff only. Without it no visibility control is rendered at all. */
  canPostInternal: boolean;
  submitting: boolean;
  serverMessages: string[];
  /**
   * `onSubmitted` is invoked by the caller only once the comment has actually
   * been accepted by the server; the draft is cleared then, never on submit.
   * Posting is fire-and-forget from this component's point of view, so
   * clearing eagerly would discard up to 5,000 characters of the user's
   * writing on any failure.
   */
  onSubmit: (
    body: string,
    visibility: CommentVisibility,
    onSubmitted: () => void,
  ) => void;
}

export function CommentForm({
  canPostInternal,
  submitting,
  serverMessages,
  onSubmit,
}: CommentFormProps) {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('Public');
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed === '') {
      setError('Write a comment before posting.');
      return;
    }
    if (trimmed.length > FIELD_LIMITS.commentBody) {
      setError(
        `Keep the comment to ${FIELD_LIMITS.commentBody} characters or fewer.`,
      );
      return;
    }
    setError(undefined);
    onSubmit(trimmed, visibility, () => {
      setBody('');
      setVisibility('Public');
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <FormField id="comment-body" label="Add a comment" required error={error}>
        {({ id, describedBy, required }) => (
          <Textarea
            id={id}
            name="body"
            rows={4}
            required={required}
            value={body}
            maxLength={FIELD_LIMITS.commentBody}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </FormField>

      {/*
        The visibility control is rendered for staff only — an Employee has no
        way to select "Internal" in the UI, and the backend independently
        returns 403 if one is ever requested.
      */}
      {canPostInternal ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-900">
            Visibility
          </legend>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="visibility"
              value="Public"
              checked={visibility === 'Public'}
              onChange={() => setVisibility('Public')}
            />
            Public — visible to the requester
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="visibility"
              value="Internal"
              checked={visibility === 'Internal'}
              onChange={() => setVisibility('Internal')}
            />
            Internal note — staff only
          </label>
        </fieldset>
      ) : null}

      <div aria-live="assertive">
        {serverMessages.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-red-700">
            {serverMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}
