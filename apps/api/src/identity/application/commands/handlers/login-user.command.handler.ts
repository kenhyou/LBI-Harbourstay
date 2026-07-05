import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LoginUserCommand } from '@/identity/application/commands/login-user.command';
import { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import { PasswordHasherPort } from '@/identity/application/ports/password-hasher.port';
import { AuthTokenPort } from '@/identity/application/ports/auth-token.port';
import type { AuthResult } from '@/identity/application/results/auth-result';
import { toAuthUser } from '@/identity/application/mappers/auth-user.mapper';
import { Email } from '@/identity/domain/vo/email.vo';
import { InvalidCredentialsException } from '@/identity/domain/exceptions/invalid-credentials.exception';

/**
 * Orchestrates login: look the user up by normalized email, verify the password
 * via the hasher port, then mint tokens. Unknown email and bad password both
 * raise the SAME `InvalidCredentialsException` (no user enumeration).
 */
@CommandHandler(LoginUserCommand)
export class LoginUserHandler
  implements ICommandHandler<LoginUserCommand, AuthResult>
{
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly hasher: PasswordHasherPort,
    private readonly tokens: AuthTokenPort,
  ) {}

  async execute(command: LoginUserCommand): Promise<AuthResult> {
    const email = Email.create(command.email);
    const user = await this.users.findByEmail(email.value);
    if (!user) {
      throw new InvalidCredentialsException();
    }

    const ok = await this.hasher.compare(command.password, user.passwordHash);
    if (!ok) {
      throw new InvalidCredentialsException();
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
