import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_ARTICLE_STATUSES } from '../../types/api';
import {
  allowedArticleTransitions,
  articleStatusLabel,
  articleTransitionLabel,
  canChangeArticleStatus,
  canEditAnyArticle,
} from './articleStatus';

/**
 * This module mirrors `ALLOWED_ARTICLE_TRANSITIONS` and the two role helpers
 * in `backend/src/knowledge-base/knowledge-base.constants.ts`. It decides what
 * the UI *offers*; the backend re-validates. These tests pin the mirror so a
 * drift shows up here rather than as a 400 a user meets at runtime.
 */
describe('article transition matrix', () => {
  it('lets a draft be published or archived', () => {
    expect(allowedArticleTransitions('Draft')).toEqual([
      'Published',
      'Archived',
    ]);
  });

  it('lets a published article be unpublished or archived', () => {
    expect(allowedArticleTransitions('Published')).toEqual([
      'Draft',
      'Archived',
    ]);
  });

  it('never offers Archived -> Published — retired guidance is re-reviewed as a draft', () => {
    expect(allowedArticleTransitions('Archived')).toEqual(['Draft']);
    expect(allowedArticleTransitions('Archived')).not.toContain('Published');
  });

  it('leaves no status terminal — Archived is a retire path, not a delete', () => {
    for (const status of KNOWLEDGE_ARTICLE_STATUSES) {
      expect(allowedArticleTransitions(status).length).toBeGreaterThan(0);
    }
  });

  it('never offers a self-transition as a button', () => {
    for (const status of KNOWLEDGE_ARTICLE_STATUSES) {
      expect(allowedArticleTransitions(status)).not.toContain(status);
    }
  });
});

describe('transition labels', () => {
  it('distinguishes an unpublish from a restore, since both land on Draft', () => {
    expect(articleTransitionLabel('Published', 'Draft')).toBe('Unpublish');
    expect(articleTransitionLabel('Archived', 'Draft')).toBe('Restore to draft');
  });

  it('labels the other moves plainly', () => {
    expect(articleTransitionLabel('Draft', 'Published')).toBe('Publish');
    expect(articleTransitionLabel('Draft', 'Archived')).toBe('Archive');
  });

  it('never renders a raw enum as a status label', () => {
    for (const status of KNOWLEDGE_ARTICLE_STATUSES) {
      expect(articleStatusLabel(status)).not.toBe('');
    }
  });
});

describe('authoring roles', () => {
  it('restricts publishing to TeamLead and Administrator', () => {
    expect(canChangeArticleStatus('Employee')).toBe(false);
    expect(canChangeArticleStatus('SupportAgent')).toBe(false);
    expect(canChangeArticleStatus('TeamLead')).toBe(true);
    expect(canChangeArticleStatus('Administrator')).toBe(true);
  });

  it("restricts editing someone else's article to the same editorial roles", () => {
    expect(canEditAnyArticle('Employee')).toBe(false);
    expect(canEditAnyArticle('SupportAgent')).toBe(false);
    expect(canEditAnyArticle('TeamLead')).toBe(true);
    expect(canEditAnyArticle('Administrator')).toBe(true);
  });
});
