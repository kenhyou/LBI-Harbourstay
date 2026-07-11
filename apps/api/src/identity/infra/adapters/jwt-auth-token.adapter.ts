import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthTokenPort,
  type AuthTokenClaims,
  type IssuedTokens,
} from '@/identity/application/ports/auth-token.port';

type TokenKind = 'access' | 'refresh';

/**
 * Read a JWT signing secret from config. In production a missing secret is a
 * hard failure (throw → the process refuses to boot) rather than a silent fall
 * back to a public default; outside production we return the dev fallback so
 * local runs and tests need no setup.
 */
function requireSecret(
  config: ConfigService,
  key: string,
  devFallback: string,
  isProduction: boolean,
): string {
  const value = config.get<string>(key);
  if (value) {
    return value;
  }
  if (isProduction) {
    throw new Error(
      `${key} must be set in production — refusing to boot on a well-known default secret.`,
    );
  }
  return devFallback;
}

/**
 * JWT impl of the `AuthTokenPort`. Signs a short-lived access token and a
 * long-lived refresh token, each with its OWN secret + a `typ` claim so an
 * access token can never be replayed as a refresh token (and vice-versa).
 * The only place the signing library and secrets live (ADR-0006).
 */
@Injectable()
export class JwtAuthTokenAdapter extends AuthTokenPort {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    super();
    // In production the signing secrets MUST come from the environment (SSM). We
    // deliberately do NOT fall back to a literal default there: booting on a
    // well-known secret like `'dev-access-secret'` would let anyone forge a valid
    // session token (auth bypass). So `requireSecret` throws at construction —
    // i.e. the service refuses to boot — when a secret is missing in production
    // (S7a hardening; see docs/security-audit.md). Local/test runs keep a friendly
    // fallback so `pnpm dev` and unit tests need no env setup.
    const isProduction =
      (config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production';
    this.accessSecret = requireSecret(
      config,
      'JWT_ACCESS_SECRET',
      'dev-access-secret',
      isProduction,
    );
    this.refreshSecret = requireSecret(
      config,
      'JWT_REFRESH_SECRET',
      'dev-refresh-secret',
      isProduction,
    );
    this.accessTtl = config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    this.refreshTtl = config.get<string>('JWT_REFRESH_TTL') ?? '7d';
  }

  issueTokens(claims: AuthTokenClaims): IssuedTokens {
    return {
      accessToken: this.jwt.sign(
        { ...claims, typ: 'access' satisfies TokenKind },
        { secret: this.accessSecret, expiresIn: this.accessTtl },
      ),
      refreshToken: this.jwt.sign(
        { ...claims, typ: 'refresh' satisfies TokenKind },
        { secret: this.refreshSecret, expiresIn: this.refreshTtl },
      ),
    };
  }

  verifyAccessToken(token: string): AuthTokenClaims {
    return this.verify(token, this.accessSecret, 'access');
  }

  verifyRefreshToken(token: string): AuthTokenClaims {
    return this.verify(token, this.refreshSecret, 'refresh');
  }

  private verify(token: string, secret: string, expected: TokenKind): AuthTokenClaims {
    const payload = this.jwt.verify<AuthTokenClaims & { typ?: TokenKind }>(token, {
      secret,
    });
    if (payload.typ !== expected) {
      throw new Error(`Expected a ${expected} token, got ${payload.typ ?? 'unknown'}`);
    }
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}
