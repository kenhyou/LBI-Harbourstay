/**
 * `RefreshToken` command (BC-7). Carries a refresh token (read from the
 * httpOnly cookie by the presenter). Rotates a fresh access + refresh pair.
 */
export class RefreshTokenCommand {
  constructor(public readonly refreshToken: string) {}
}
