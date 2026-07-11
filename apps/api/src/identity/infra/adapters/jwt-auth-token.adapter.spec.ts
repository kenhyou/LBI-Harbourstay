import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthTokenAdapter } from './jwt-auth-token.adapter';
import type { AuthTokenClaims } from '@/identity/application/ports/auth-token.port';

/**
 * Real-JWT spec for the token adapter (no mocks — a genuine sign/verify round
 * trip). Green now. Uses distinct secrets so cross-kind replay is provable.
 */
describe('JwtAuthTokenAdapter', () => {
  const claims: AuthTokenClaims = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'me@example.com',
    role: 'host',
  };

  function configOf(values: Record<string, string | undefined>): ConfigService {
    return {
      get: (key: string) => values[key],
    } as unknown as ConfigService;
  }

  function build() {
    return new JwtAuthTokenAdapter(
      new JwtService(),
      configOf({
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      }),
    );
  }

  it('issues an access + refresh pair that each verify back to the claims', () => {
    const adapter = build();
    const { accessToken, refreshToken } = adapter.issueTokens(claims);

    expect(adapter.verifyAccessToken(accessToken)).toEqual(claims);
    expect(adapter.verifyRefreshToken(refreshToken)).toEqual(claims);
  });

  it('rejects an access token presented as a refresh token (wrong kind/secret)', () => {
    const adapter = build();
    const { accessToken } = adapter.issueTokens(claims);
    expect(() => adapter.verifyRefreshToken(accessToken)).toThrow();
  });

  it('rejects a refresh token presented as an access token', () => {
    const adapter = build();
    const { refreshToken } = adapter.issueTokens(claims);
    expect(() => adapter.verifyAccessToken(refreshToken)).toThrow();
  });

  it('rejects a tampered/garbage token', () => {
    const adapter = build();
    expect(() => adapter.verifyAccessToken('not.a.jwt')).toThrow();
  });

  // ── S7a: production must NOT boot on a well-known default secret ──────────────
  it('throws in production when a JWT secret env var is unset (fail-fast, no forgeable default)', () => {
    const config = configOf({ NODE_ENV: 'production' }); // secrets missing
    expect(() => new JwtAuthTokenAdapter(new JwtService(), config)).toThrow(
      /JWT_ACCESS_SECRET must be set in production/,
    );
  });

  it('constructs in production when the JWT secrets ARE provided', () => {
    const config = configOf({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-real-access-secret',
      JWT_REFRESH_SECRET: 'a-real-refresh-secret',
    });
    expect(() => new JwtAuthTokenAdapter(new JwtService(), config)).not.toThrow();
  });

  it('falls back to a dev secret OUTSIDE production (local runs need no env setup)', () => {
    const config = configOf({}); // no NODE_ENV, no secrets → dev fallback
    const adapter = new JwtAuthTokenAdapter(new JwtService(), config);
    const { accessToken } = adapter.issueTokens(claims);
    expect(adapter.verifyAccessToken(accessToken)).toEqual(claims);
  });
});
