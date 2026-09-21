import { TicketPriority } from '@prisma/client';
import {
  MAX_DRAFT_CHARS,
  MAX_PROMPT_ARTICLES,
  MAX_RATIONALE_CHARS,
  MAX_SUMMARY_CHARS,
  TICKET_PRIORITIES,
} from './ai.constants';
import { stripControlChars } from './ai.text';
import { AiProviderError } from './ai.types';

/**
 * Vendor-neutral output validation (ADR-023 Decision 6). The model's text is
 * untrusted: nothing about it is believed. These functions only ever return
 * values that are either plain validated strings or members of a closed set
 * the caller supplied. Names never come from here — the service looks them
 * up from the database by the validated id.
 *
 * Failure model: text that is not a JSON object at all is `invalid_output`
 * (a 503). A wrong FIELD degrades to null/empty, so a good priority survives
 * a hallucinated category id. The one exception is a field that IS the
 * response (a draft, a summary): empty or oversized is `invalid_output`,
 * because a 200 carrying nothing would be a footgun for a client.
 */


export interface ValidatedTriage {
  categoryId: string | null;
  priority: TicketPriority | null;
  rationale: string | null;
  articleIds: string[];
}

export interface ValidatedDraft {
  draft: string;
  articleIds: string[];
}

export interface ValidatedSummary {
  summary: string;
}

/** Parses the model's text into a JSON object, tolerating a markdown code
 * fence or surrounding prose. Anything else is `invalid_output`. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AiProviderError('invalid_output');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiProviderError('invalid_output');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AiProviderError('invalid_output');
  }
  return parsed as Record<string, unknown>;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = stripControlChars(value).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Ids that are strings AND members of the allowed set, de-duplicated, in the
 * model's order, capped. Anything else is dropped silently. */
export function groundIds(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && allowed.has(item) && !out.includes(item)) {
      out.push(item);
    }
    if (out.length >= MAX_PROMPT_ARTICLES) {
      break;
    }
  }
  return out;
}

export function validateTriageOutput(
  text: string,
  allowedCategoryIds: ReadonlySet<string>,
  allowedArticleIds: ReadonlySet<string>,
): ValidatedTriage {
  const obj = parseJsonObject(text);

  const categoryId =
    typeof obj.categoryId === 'string' && allowedCategoryIds.has(obj.categoryId)
      ? obj.categoryId
      : null;

  const priority =
    typeof obj.priority === 'string' && TICKET_PRIORITIES.includes(obj.priority)
      ? (obj.priority as TicketPriority)
      : null;

  const rationaleText = cleanText(obj.rationale);
  const rationale =
    rationaleText !== null && rationaleText.length <= MAX_RATIONALE_CHARS ? rationaleText : null;

  return {
    categoryId,
    priority,
    rationale,
    articleIds: groundIds(obj.articleIds, allowedArticleIds),
  };
}

function requiredText(value: unknown, maxChars: number): string {
  const text = cleanText(value);
  if (text === null || text.length > maxChars) {
    throw new AiProviderError('invalid_output');
  }
  return text;
}

export function validateDraftOutput(
  text: string,
  allowedArticleIds: ReadonlySet<string>,
): ValidatedDraft {
  const obj = parseJsonObject(text);
  return {
    draft: requiredText(obj.draft, MAX_DRAFT_CHARS),
    articleIds: groundIds(obj.articleIds, allowedArticleIds),
  };
}

export function validateSummaryOutput(text: string): ValidatedSummary {
  const obj = parseJsonObject(text);
  return { summary: requiredText(obj.summary, MAX_SUMMARY_CHARS) };
}
