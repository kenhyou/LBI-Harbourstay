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
    this.accessSecret = config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
    this.refreshSecret =
      config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret';
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
