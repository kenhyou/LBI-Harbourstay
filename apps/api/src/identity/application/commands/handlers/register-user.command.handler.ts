import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RegisterUserCommand } from '@/identity/application/commands/register-user.command';
import { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import { PasswordHasherPort } from '@/identity/application/ports/password-hasher.port';
import { AuthTokenPort } from '@/identity/application/ports/auth-token.port';
import type { AuthResult } from '@/identity/application/results/auth-result';
import { toAuthUser } from '@/identity/application/mappers/auth-user.mapper';
import { User } from '@/identity/domain/models/user.model';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';
import { EmailAlreadyInUseException } from '@/identity/domain/exceptions/email-already-in-use.exception';

/**
 * Orchestrates registration: normalize the email (VO), enforce uniqueness via
 * the repo, hash the password (port), build the aggregate (domain factory),
 * persist, then mint tokens. No business branching lives here beyond the
 * repository-backed uniqueness precondition (which cannot live in a single
 * aggregate).
 */
@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler
  implements ICommandHandler<RegisterUserCommand, AuthResult>
{
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly hasher: PasswordHasherPort,
    private readonly tokens: AuthTokenPort,
  ) {}

  async execute(command: RegisterUserCommand): Promise<AuthResult> {
    const email = Email.create(command.email);

    const existing = await this.users.findByEmail(email.value);
    if (existing) {
      throw new EmailAlreadyInUseException(email.value);
    }

    const passwordHash = await this.hasher.hash(command.password);
    const role = command.role === 'host' ? Role.Host : Role.Guest;
    const user = User.create({ email, passwordHash, role });
    await this.users.save(user);

    const authUser = toAuthUser(user);
    const tokens = this.tokens.issueTokens({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
    });
    return { user: authUser, tokens };
  }
}
