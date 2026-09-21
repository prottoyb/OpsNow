import { KnowledgeArticleStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateArticleFeedbackDto } from './create-article-feedback.dto';
import { CreateKnowledgeArticleDto } from './create-knowledge-article.dto';
import { ListKnowledgeArticlesQueryDto } from './list-knowledge-articles-query.dto';
import { UpdateKnowledgeArticleDto } from './update-knowledge-article.dto';

/**
 * DTO-level validation is the first line that keeps unbounded or
 * malformed input away from the database: `title`'s cap matches the
 * schema column width and `content`'s is the deliberate ceiling on an
 * otherwise unbounded TEXT column, so an oversized value is a 400 rather
 * than a raw driver error.
 */
function failedProperties(dto: object): string[] {
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
    (error) => error.property,
  );
}

function createDto(overrides: Record<string, unknown> = {}): CreateKnowledgeArticleDto {
  return plainToInstance(CreateKnowledgeArticleDto, {
    title: 'How to Reset Your Password',
    content: 'Contact the service desk to request a reset link.',
    ...overrides,
  });
}

describe('CreateKnowledgeArticleDto', () => {
  it('accepts a valid payload', () => {
    expect(failedProperties(createDto())).toEqual([]);
  });

  it.each([
    ['title', { title: 'x'.repeat(201) }],
    ['content', { content: 'x'.repeat(50001) }],
  ])('rejects an oversized %s', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it.each([
    ['title', { title: '   ' }],
    ['content', { content: '   ' }],
  ])('rejects a whitespace-only %s (trimmed before validation)', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it.each([['title'], ['content']])('requires %s', (property) => {
    const payload: Record<string, unknown> = {
      title: 'A title',
      content: 'Some content',
    };
    delete payload[property];
    expect(
      failedProperties(plainToInstance(CreateKnowledgeArticleDto, payload)),
    ).toContain(property);
  });

  it('rejects a non-uuid categoryId', () => {
    expect(failedProperties(createDto({ categoryId: 'not-a-uuid' }))).toContain(
      'categoryId',
    );
  });

  it.each([
    ['title', { title: 'AB\u0000CD' }],
    ['content', { content: 'AB\u0000CD' }],
  ])(
    'rejects a NUL byte in %s — Postgres refuses it and Prisma reports it as an unmapped 500',
    (property, overrides) => {
      expect(failedProperties(createDto(overrides))).toContain(property);
    },
  );

  it('still allows the newlines and tabs an article body genuinely contains', () => {
    expect(
      failedProperties(
        createDto({ content: 'Step one\nStep two\r\n\tIndented detail' }),
      ),
    ).toEqual([]);
  });

  it('rejects other C0 control characters in content', () => {
    expect(failedProperties(createDto({ content: 'bell\u0007here' }))).toContain(
      'content',
    );
  });

  // `forbidNonWhitelisted: true` is applied globally; these fields are
  // server-owned and must never be settable by a client.
  it.each([
    ['status', { status: 'Published' }],
    ['authorId', { authorId: '11111111-1111-4111-8111-111111111111' }],
    ['slug', { slug: 'chosen-by-the-client' }],
    ['publishedAt', { publishedAt: '2026-01-01' }],
    ['viewCount', { viewCount: 9999 }],
  ])('refuses a client-supplied %s', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });
});

describe('UpdateKnowledgeArticleDto', () => {
  it('accepts an empty payload — every field is optional', () => {
    expect(failedProperties(plainToInstance(UpdateKnowledgeArticleDto, {}))).toEqual(
      [],
    );
  });

  // `@IsOptional()` skips every validator for null as well as undefined,
  // so `{ title: null }` would validate clean, reach Prisma as a null
  // write to a NOT NULL column, and come back as a 500.
  it.each([['title'], ['content'], ['status']])(
    'rejects an explicit null on the non-nullable %s',
    (property) => {
      expect(
        failedProperties(
          plainToInstance(UpdateKnowledgeArticleDto, { [property]: null }),
        ),
      ).toContain(property);
    },
  );

  it('accepts an explicit null categoryId — that is how an article leaves its category', () => {
    const dto = plainToInstance(UpdateKnowledgeArticleDto, { categoryId: null });
    expect(failedProperties(dto)).toEqual([]);
    expect(dto.categoryId).toBeNull();
  });

  it('accepts a known KnowledgeArticleStatus', () => {
    expect(
      failedProperties(
        plainToInstance(UpdateKnowledgeArticleDto, {
          status: KnowledgeArticleStatus.Published,
        }),
      ),
    ).toEqual([]);
  });

  it('rejects a status outside the enum', () => {
    expect(
      failedProperties(
        plainToInstance(UpdateKnowledgeArticleDto, { status: 'Deleted' }),
      ),
    ).toContain('status');
  });

  it.each([
    ['an oversized title', { title: 'x'.repeat(201) }, 'title'],
    ['an oversized content', { content: 'x'.repeat(50001) }, 'content'],
    ['a NUL byte', { title: 'AB\u0000CD' }, 'title'],
  ])('rejects %s on update too', (_label, payload, property) => {
    expect(
      failedProperties(plainToInstance(UpdateKnowledgeArticleDto, payload)),
    ).toContain(property);
  });

  it.each([['slug'], ['authorId'], ['viewCount'], ['publishedAt']])(
    'refuses a client-supplied %s',
    (property) => {
      expect(
        failedProperties(
          plainToInstance(UpdateKnowledgeArticleDto, { [property]: 'x' }),
        ),
      ).toContain(property);
    },
  );
});

describe('ListKnowledgeArticlesQueryDto', () => {
  it('accepts the documented filters', () => {
    const dto = plainToInstance(ListKnowledgeArticlesQueryDto, {
      q: 'vpn',
      status: KnowledgeArticleStatus.Draft,
      categoryId: '11111111-1111-4111-8111-111111111111',
      authorId: '22222222-2222-4222-8222-222222222222',
      limit: 10,
      offset: 0,
    });
    expect(failedProperties(dto)).toEqual([]);
  });

  it('trims q, so an all-whitespace term is treated as absent by the service', () => {
    const dto = plainToInstance(ListKnowledgeArticlesQueryDto, { q: '   ' });
    expect(failedProperties(dto)).toEqual([]);
    expect(dto.q).toBe('');
  });

  it('accepts search terms full of SQL and tsquery metacharacters', () => {
    // The raw search path binds `q` as a parameter and uses
    // websearch_to_tsquery, so nothing here is special — but the DTO must
    // not be the thing that rejects it either.
    for (const q of ["'; DROP TABLE users;--", '%', '_', '\\', '& | !', '""']) {
      expect(
        failedProperties(plainToInstance(ListKnowledgeArticlesQueryDto, { q })),
      ).toEqual([]);
    }
  });

  it('rejects a q containing a control character', () => {
    // `q` is bound as a parameter into a raw websearch_to_tsquery
    // call, so a NUL byte is not an injection risk - but Postgres
    // cannot represent it in text at all and answers SQLSTATE 22021,
    // which surfaced as a 500. It must be a 400 at the DTO boundary.
    for (const q of ['vpn\u0000', '\u0000', 'a\u001Bb']) {
      expect(
        failedProperties(plainToInstance(ListKnowledgeArticlesQueryDto, { q })),
      ).toContain('q');
    }
  });

  it('rejects an oversized q', () => {
    expect(
      failedProperties(
        plainToInstance(ListKnowledgeArticlesQueryDto, { q: 'x'.repeat(201) }),
      ),
    ).toContain('q');
  });

  it.each([['categoryId'], ['authorId']])('rejects a non-uuid %s', (property) => {
    expect(
      failedProperties(
        plainToInstance(ListKnowledgeArticlesQueryDto, { [property]: 'nope' }),
      ),
    ).toContain(property);
  });

  it.each([
    ['limit', { limit: 0 }],
    ['limit', { limit: 101 }],
    ['offset', { offset: -1 }],
  ])('rejects an out-of-range %s', (property, payload) => {
    expect(
      failedProperties(plainToInstance(ListKnowledgeArticlesQueryDto, payload)),
    ).toContain(property);
  });
});

describe('CreateArticleFeedbackDto', () => {
  it('accepts a bare vote', () => {
    expect(
      failedProperties(
        plainToInstance(CreateArticleFeedbackDto, { isHelpful: true }),
      ),
    ).toEqual([]);
  });

  it('accepts a vote with a comment', () => {
    expect(
      failedProperties(
        plainToInstance(CreateArticleFeedbackDto, {
          isHelpful: false,
          comment: 'The second step is out of date.',
        }),
      ),
    ).toEqual([]);
  });

  it('requires isHelpful — "was this useful?" has no safe default', () => {
    expect(
      failedProperties(plainToInstance(CreateArticleFeedbackDto, {})),
    ).toContain('isHelpful');
  });

  it('rejects a non-boolean isHelpful', () => {
    expect(
      failedProperties(
        plainToInstance(CreateArticleFeedbackDto, { isHelpful: 'yes' }),
      ),
    ).toContain('isHelpful');
  });

  it('rejects an oversized comment', () => {
    expect(
      failedProperties(
        plainToInstance(CreateArticleFeedbackDto, {
          isHelpful: true,
          comment: 'x'.repeat(1001),
        }),
      ),
    ).toContain('comment');
  });

  it('rejects a NUL byte in the comment but allows newlines', () => {
    expect(
      failedProperties(
        plainToInstance(CreateArticleFeedbackDto, {
          isHelpful: true,
          comment: 'bad\u0000comment',
        }),
      ),
    ).toContain('comment');
    expect(
      failedProperties(
        plainToInstance(CreateArticleFeedbackDto, {
          isHelpful: true,
          comment: 'line one\nline two',
        }),
      ),
    ).toEqual([]);
  });
});
