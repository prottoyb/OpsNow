import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { TicketsController } from '../tickets/tickets.controller';
import { AssetsController } from './assets.controller';

/**
 * The service enforces roles itself (see assets.service.spec.ts), but the
 * @Roles metadata is the globally-registered RolesGuard's input — a route
 * that lost it would still be reachable by an Employee, so assert it is
 * present on exactly the staff-only routes and absent on the read routes
 * that are row-scoped instead.
 */
function routeRoles(
  controller: object,
  method: string,
): Role[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    (controller as Record<string, () => unknown>)[method],
  ) as Role[] | undefined;
}

describe('AssetsController route roles', () => {
  it.each(['create', 'update', 'updateAssignment', 'findAssignments'])(
    'restricts %s to staff roles',
    (method) => {
      expect(routeRoles(AssetsController.prototype, method)).toEqual([
        ...STAFF_ROLES,
      ]);
    },
  );

  it.each(['findAll', 'findOne'])(
    'leaves %s open to any authenticated user (row-scoped by the service)',
    (method) => {
      expect(routeRoles(AssetsController.prototype, method)).toBeUndefined();
    },
  );
});

describe('TicketsController asset-link route roles', () => {
  it.each(['linkAsset', 'unlinkAsset'])('restricts %s to staff roles', (method) => {
    expect(routeRoles(TicketsController.prototype, method)).toEqual([
      ...STAFF_ROLES,
    ]);
  });

  it('leaves findAssets open to anyone who can already see the ticket', () => {
    expect(routeRoles(TicketsController.prototype, 'findAssets')).toBeUndefined();
  });
});
