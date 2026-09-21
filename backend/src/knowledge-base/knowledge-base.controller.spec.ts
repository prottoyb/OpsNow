import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { KnowledgeBaseCategoriesController } from '../knowledge-base-categories/knowledge-base-categories.controller';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { TicketsController } from '../tickets/tickets.controller';
import { KnowledgeBaseController } from './knowledge-base.controller';

/**
 * The service enforces roles itself (see knowledge-base.service.spec.ts),
 * but the @Roles metadata is the globally-registered RolesGuard's input —
 * a route that lost it would still be reachable by an Employee, so assert
 * it is present on exactly the staff-only routes and absent on the ones
 * that are row-scoped instead.
 */
function routeRoles(controller: object, method: string): Role[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    (controller as Record<string, () => unknown>)[method],
  ) as Role[] | undefined;
}

describe('KnowledgeBaseController route roles', () => {
  it.each([
    ['create', 'authoring is staff-only'],
    ['update', 'authoring is staff-only'],
    ['findFeedback', 'feedback comments and their authors are staff-only data'],
  ])('restricts %s to staff roles (%s)', (method) => {
    expect(routeRoles(KnowledgeBaseController.prototype, method)).toEqual([
      ...STAFF_ROLES,
    ]);
  });

  it.each([
    ['findAll'],
    ['findOne'],
    // Rating the guidance you were given is the point of the feature; the
    // article's own visibility is what scopes it.
    ['submitFeedback'],
  ])(
    'leaves %s open to any authenticated user (row-scoped by the service)',
    (method) => {
      expect(
        routeRoles(KnowledgeBaseController.prototype, method),
      ).toBeUndefined();
    },
  );

  it('exposes no delete route — Archived is the retire path', () => {
    expect(KnowledgeBaseController.prototype).not.toHaveProperty('remove');
    expect(KnowledgeBaseController.prototype).not.toHaveProperty('delete');
  });
});

describe('KnowledgeBaseCategoriesController route roles', () => {
  it('leaves the category listing open to any authenticated user', () => {
    expect(
      routeRoles(KnowledgeBaseCategoriesController.prototype, 'findAll'),
    ).toBeUndefined();
  });

  it('exposes read only — categories are admin-managed reference data', () => {
    const methods = Object.getOwnPropertyNames(
      KnowledgeBaseCategoriesController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(methods).toEqual(['findAll']);
  });
});

describe('TicketsController knowledge-article link route roles', () => {
  it.each(['linkKnowledgeArticle', 'unlinkKnowledgeArticle'])(
    'restricts %s to staff roles',
    (method) => {
      expect(routeRoles(TicketsController.prototype, method)).toEqual([
        ...STAFF_ROLES,
      ]);
    },
  );

  it('leaves findKnowledgeArticles open to anyone who can already see the ticket', () => {
    expect(
      routeRoles(TicketsController.prototype, 'findKnowledgeArticles'),
    ).toBeUndefined();
  });
});
