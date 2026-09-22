import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import type { KnowledgeBaseCategory } from '../../../types/api';
import { FIELD_LIMITS } from '../../../types/api';
import { ArticleCategorySelect } from './ArticleCategorySelect';

export interface ArticleFormValues {
  title: string;
  content: string;
  /** '' means "no category" — sent as an explicit null on edit. */
  categoryId: string;
}

export interface ArticleFormProps {
  initialValues: ArticleFormValues;
  categories: readonly KnowledgeBaseCategory[];
  submitting: boolean;
  /** Backend validation messages, rendered verbatim. */
  serverMessages: string[];
  submitLabel: string;
  onSubmit: (values: ArticleFormValues) => void;
  onCancel?: () => void;
}

type FieldErrors = Partial<Record<'title' | 'content', string>>;

/**
 * Client-side checks mirror the limits in
 * `backend/src/knowledge-base/dto/create-knowledge-article.dto.ts` so the
 * obvious mistakes are caught without a round trip. They are a convenience,
 * never the authority — the backend's ValidationPipe re-validates everything
 * and its messages are surfaced unchanged in `serverMessages`.
 *
 * Deliberately absent: a `status` field. Status is a separate control
 * (`ArticleStatusControl`) restricted to TeamLead/Administrator, and a
 * SupportAgent sending the key at all is a 403 even on their own article —
 * so this form must never include it.
 */
function validate(values: ArticleFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  const content = values.content.trim();

  if (title === '') {
    errors.title = 'Enter a title.';
  } else if (title.length > FIELD_LIMITS.articleTitle) {
    errors.title = `Keep the title to ${FIELD_LIMITS.articleTitle} characters or fewer.`;
  }

  if (content === '') {
    errors.content = 'Enter the article body.';
  } else if (content.length > FIELD_LIMITS.articleContent) {
    errors.content = `Keep the body to ${FIELD_LIMITS.articleContent} characters or fewer.`;
  }

  return errors;
}

export function ArticleForm({
  initialValues,
  categories,
  submitting,
  serverMessages,
  submitLabel,
  onSubmit,
  onCancel,
}: ArticleFormProps) {
  const [values, setValues] = useState<ArticleFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSubmit({
      ...values,
      title: values.title.trim(),
      content: values.content.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        id="article-title"
        label="Title"
        required
        error={fieldErrors.title}
        hint={`Up to ${FIELD_LIMITS.articleTitle} characters. The article's web address is fixed from the first title and does not change if you retitle it later.`}
      >
        {({ id, describedBy, required }) => (
          <Input
            id={id}
            name="title"
            required={required}
            value={values.title}
            maxLength={FIELD_LIMITS.articleTitle}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.title ? true : undefined}
            onChange={(event) =>
              setValues((current) => ({ ...current, title: event.target.value }))
            }
          />
        )}
      </FormField>

      <FormField
        id="article-category"
        label="Category"
        hint="Optional. Choose “No category” to leave the article uncategorised."
      >
        {({ id, describedBy }) => (
          <ArticleCategorySelect
            id={id}
            value={values.categoryId}
            categories={categories}
            describedBy={describedBy}
            noneLabel="No category"
            onChange={(categoryId) =>
              setValues((current) => ({ ...current, categoryId }))
            }
          />
        )}
      </FormField>

      {/*
        A visual break between identifying the article (title/category,
        above) and writing it (body, below) — two conceptually different
        steps that previously ran together as one undifferentiated field
        list.
      */}
      <div className="border-t border-slate-100 pt-4">
        <FormField
          id="article-content"
          label="Body"
          required
          error={fieldErrors.content}
          hint="Plain text. Line breaks are kept; Markdown and HTML are shown exactly as typed, not formatted."
        >
          {({ id, describedBy, required }) => (
            <Textarea
              id={id}
              name="content"
              rows={14}
              required={required}
              value={values.content}
              maxLength={FIELD_LIMITS.articleContent}
              aria-describedby={describedBy}
              aria-invalid={fieldErrors.content ? true : undefined}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
            />
          )}
        </FormField>
      </div>

      <div aria-live="assertive">
        {serverMessages.length > 0 ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-900">
              The article could not be saved
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
              {serverMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
