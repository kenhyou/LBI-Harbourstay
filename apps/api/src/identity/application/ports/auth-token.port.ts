/**
 * Claims carried inside a JWT. Primitives only (this crosses the infra
 * boundary and serializes into a token) — never a domain VO or the `Role` enum.
 * `role` is the raw contract string; `sub` is the user id.
 */
export interface AuthTokenClaims {
  sub: string;
  email: string;
  role: string;
}

/** A freshly-minted access + refresh token pair. */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * JWT issue/verify port (BC-7). The only abstraction over the signing library;
 * the impl (infra) owns secrets, algorithm, and expiries. Verify throws if a
 * token is missing/expired/tampered/of the wrong kind (access vs refresh).
 */
export abstract class AuthTokenPort {
  /** Sign an access + refresh pair for the given claims. */
  abstract issueTokens(claims: AuthTokenClaims): IssuedTokens;

  /** Verify + decode an access token, or throw if invalid. */
  abstract verifyAccessToken(token: string): AuthTokenClaims;

  /** Verify + decode a refresh token, or throw if invalid. */
  abstract verifyRefreshToken(token: string): AuthTokenClaims;
}
