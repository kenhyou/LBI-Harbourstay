import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@harbourstay/shared';
import { ROLES_KEY } from '@/identity/presenters/http/decorators/roles.decorator';
import type { AuthenticatedRequest } from '@/identity/presenters/http/guards/jwt-cookie.guard';

/**
 * RBAC guard. Reads the roles required by `@Roles()` (method overrides class);
 * with none declared the route is open to any authenticated user. Expects
 * `JwtCookieGuard` to have run first and populated `req.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
