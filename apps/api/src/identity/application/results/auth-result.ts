import type { AuthUser } from '@harbourstay/shared';
import type { IssuedTokens } from '@/identity/application/ports/auth-token.port';

/**
 * Result of a successful register/login/refresh: the SAFE user projection plus
 * a fresh token pair. The presenter puts the tokens into httpOnly cookies and
 * returns only the `AuthUser` body — tokens never appear in the JSON payload.
 */
export interface AuthResult {
  user: AuthUser;
  tokens: IssuedTokens;
}
