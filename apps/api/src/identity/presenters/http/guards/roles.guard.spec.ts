import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthUser } from '@harbourstay/shared';
import { RolesGuard } from './roles.guard';

/**
 * Unit spec for the RBAC guard. No domain, no DB — just Reflector metadata +
 * the request user. Green now.
 */
describe('RolesGuard', () => {
  function contextWithUser(user?: AuthUser): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  function guardWith(required: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  const host: AuthUser = { id: 'u1', email: 'h@x.com', role: 'host' };
  const guest: AuthUser = { id: 'u2', email: 'g@x.com', role: 'guest' };

  it('allows any authenticated user when no roles are required', () => {
    expect(guardWith(undefined).canActivate(contextWithUser(guest))).toBe(true);
  });

  it('allows an empty roles list', () => {
    expect(guardWith([]).canActivate(contextWithUser(guest))).toBe(true);
  });

  it('allows a user whose role is in the required set', () => {
    expect(guardWith(['host']).canActivate(contextWithUser(host))).toBe(true);
  });

  it('forbids a user whose role is not in the required set', () => {
    expect(() => guardWith(['host']).canActivate(contextWithUser(guest))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request when a role is required', () => {
    expect(() => guardWith(['host']).canActivate(contextWithUser(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
