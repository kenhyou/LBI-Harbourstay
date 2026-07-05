import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokenCommand } from '@/identity/application/commands/refresh-token.command';
import { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import { AuthTokenPort } from '@/identity/application/ports/auth-token.port';
import type { AuthResult } from '@/identity/application/results/auth-result';
import { toAuthUser } from '@/identity/application/mappers/auth-user.mapper';
import { InvalidCredentialsException } from '@/identity/domain/exceptions/invalid-credentials.exception';
import { UserNotFoundException } from '@/identity/domain/exceptions/user-not-found.exception';

/**
 * Orchestrates token refresh: verify the incoming refresh token, reload the
 * user it names, then rotate a fresh access + refresh pair. A missing/expired/
 * tampered token surfaces as `InvalidCredentialsException` (401) — never a raw
 * JWT library error.
 */
@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand, AuthResult>
{
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly tokens: AuthTokenPort,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthResult> {
    let claims;
    try {
      claims = this.tokens.verifyRefreshToken(command.refreshToken);
    } catch {
      throw new InvalidCredentialsException();
    }

    const user = await this.users.findById(claims.sub);
    if (!user) {
      throw new UserNotFoundException(claims.sub);
    }

    const authUser = toAuthUser(user);
    const tokens = this.tokens.issueTokens({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
    });
    return { user: authUser, tokens };
  }
}
