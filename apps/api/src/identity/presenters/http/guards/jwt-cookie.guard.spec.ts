import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type {
  AuthTokenPort,
  AuthTokenClaims,
} from '@/identity/application/ports/auth-token.port';
import { JwtCookieGuard } from './jwt-cookie.guard';
import { ACCESS_COOKIE } from '@/identity/presenters/http/auth-cookies';

/**
 * Unit spec for the cookie auth guard. The token port is mocked; no DB/domain.
 * Green now.
 */
describe('JwtCookieGuard', () => {
  const claims: AuthTokenClaims = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'me@example.com',
    role: 'host',
  };

  function contextWithCookies(cookies: Record<string, string>) {
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  function guardWith(verify: () => AuthTokenClaims) {
    const tokens = {
      issueTokens: jest.fn(),
      verifyAccessToken: jest.fn(verify),
      verifyRefreshToken: jest.fn(),
    } as unknown as AuthTokenPort;
    return new JwtCookieGuard(tokens);
  }

  it('attaches the safe user and allows a valid access cookie', () => {
    const guard = guardWith(() => claims);
    const { ctx, request } = contextWithCookies({ [ACCESS_COOKIE]: 'good.jwt' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toEqual({
      id: claims.sub,
      email: claims.email,
      role: claims.role,
    });
  });

  it('throws 401 when the access cookie is missing', () => {
    const guard = guardWith(() => claims);
    const { ctx } = contextWithCookies({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws 401 when the token fails verification', () => {
    const guard = guardWith(() => {
      throw new Error('bad signature');
    });
    const { ctx } = contextWithCookies({ [ACCESS_COOKIE]: 'tampered.jwt' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
