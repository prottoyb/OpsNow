import { KnowledgeArticleStatus, Role } from '@prisma/client';
import {
  ALLOWED_ARTICLE_TRANSITIONS,
  canChangeArticleStatus,
  canEditAnyArticle,
  isAllowedArticleTransition,
} from './knowledge-base.constants';

describe('ALLOWED_ARTICLE_TRANSITIONS', () => {
  it('covers every status, so a new enum member cannot be silently unhandled', () => {
    expect(Object.keys(ALLOWED_ARTICLE_TRANSITIONS).sort()).toEqual(
      Object.values(KnowledgeArticleStatus).sort(),
    );
  });

  it.each([
    [KnowledgeArticleStatus.Draft, KnowledgeArticleStatus.Published],
    [KnowledgeArticleStatus.Draft, KnowledgeArticleStatus.Archived],
    [KnowledgeArticleStatus.Published, KnowledgeArticleStatus.Draft],
    [KnowledgeArticleStatus.Published, KnowledgeArticleStatus.Archived],
    [KnowledgeArticleStatus.Archived, KnowledgeArticleStatus.Draft],
  ])('allows %s -> %s', (from, to) => {
    expect(isAllowedArticleTransition(from, to)).toBe(true);
  });

  it('does NOT allow Archived -> Published: retired guidance is re-reviewed as a draft first', () => {
    expect(
      isAllowedArticleTransition(
        KnowledgeArticleStatus.Archived,
        KnowledgeArticleStatus.Published,
      ),
    ).toBe(false);
  });

  it.each(Object.values(KnowledgeArticleStatus))(
    'treats %s -> itself as allowed (the service makes it a no-op)',
    (status) => {
      expect(isAllowedArticleTransition(status, status)).toBe(true);
    },
  );

  it('has no terminal status — every article can always come back as a Draft', () => {
    for (const status of Object.values(KnowledgeArticleStatus)) {
      expect(
        isAllowedArticleTransition(status, KnowledgeArticleStatus.Draft),
      ).toBe(true);
    }
  });
});

describe('role predicates', () => {
  it.each([
    [Role.Employee, false],
    [Role.SupportAgent, false],
    [Role.TeamLead, true],
    [Role.Administrator, true],
  ])('canChangeArticleStatus(%s) === %s', (role, expected) => {
    expect(canChangeArticleStatus(role)).toBe(expected);
  });

  it.each([
    [Role.Employee, false],
    [Role.SupportAgent, false],
    [Role.TeamLead, true],
    [Role.Administrator, true],
  ])('canEditAnyArticle(%s) === %s', (role, expected) => {
    expect(canEditAnyArticle(role)).toBe(expected);
  });
});
