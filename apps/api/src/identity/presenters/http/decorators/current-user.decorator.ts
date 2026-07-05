import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@harbourstay/shared';
import type { AuthenticatedRequest } from '@/identity/presenters/http/guards/jwt-cookie.guard';

/**
 * Injects the authenticated `AuthUser` that `JwtCookieGuard` attached to the
 * request. Only meaningful on routes behind that guard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
