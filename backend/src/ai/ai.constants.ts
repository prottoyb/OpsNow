import { TicketPriority } from '@prisma/client';

/** Bounded in-process concurrency (ADR-023 Decision 8). Per-instance. */
export const AI_MAX_IN_FLIGHT = 5;

/** Prompt input caps. Everything untrusted is truncated to these. */
export const MAX_PROMPT_SUBJECT_CHARS = 255;
export const MAX_PROMPT_DESCRIPTION_CHARS = 4000;
export const MAX_PROMPT_COMMENT_CHARS = 1000;
export const MAX_PROMPT_COMMENTS_DRAFT = 10;
export const MAX_PROMPT_COMMENTS_SUMMARY = 20;
export const MAX_PROMPT_CATEGORIES = 100;
export const MAX_PROMPT_CATEGORY_NAME_CHARS = 100;
export const MAX_PROMPT_ARTICLES = 5;
export const MAX_PROMPT_ARTICLE_TITLE_CHARS = 200;
export const MAX_PROMPT_ARTICLE_EXCERPT_CHARS = 200;

/** Output caps. */
export const MAX_DRAFT_CHARS = 4000;
export const MAX_SUMMARY_CHARS = 2000;
export const MAX_RATIONALE_CHARS = 500;

export const MAX_COMPLETION_TOKENS = 2048;

export const TICKET_PRIORITIES: readonly string[] = Object.values(TicketPriority);

export const MOCK_MARKER = '[MOCK AI OUTPUT - NOT A REAL MODEL ANALYSIS]';
