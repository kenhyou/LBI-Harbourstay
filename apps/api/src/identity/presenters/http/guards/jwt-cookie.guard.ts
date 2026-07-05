import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, Role as ContractRole } from '@harbourstay/shared';
import { AuthTokenPort } from '@/identity/application/ports/auth-token.port';
import { ACCESS_COOKIE } from '@/identity/presenters/http/auth-cookies';

/** A request that has passed `JwtCookieGuard` carries the resolved user. */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/**
 * Authenticates a request from the access-token cookie: verify it via the
 * `AuthTokenPort`, then attach a SAFE `AuthUser` to `req.user`. Missing or
 * invalid token → 401. Reads cookies (needs `cookie-parser`, wired in main.ts).
 */
@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenPort) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string> | undefined)?.[
      ACCESS_COOKIE
    ];
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const claims = this.tokens.verifyAccessToken(token);
      request.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role as ContractRole,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
