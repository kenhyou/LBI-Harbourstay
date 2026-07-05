import { RegisterUserHandler } from './register-user.command.handler';
import { RegisterUserCommand } from '@/identity/application/commands/register-user.command';
import type { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import type { PasswordHasherPort } from '@/identity/application/ports/password-hasher.port';
import type {
  AuthTokenPort,
  IssuedTokens,
} from '@/identity/application/ports/auth-token.port';
import { EmailAlreadyInUseException } from '@/identity/domain/exceptions/email-already-in-use.exception';
import { User } from '@/identity/domain/models/user.model';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';

/**
 * Handler spec: ports are mocked (jest.fn), the real domain factory runs.
 * RED until Ken implements `Email` + `User` (the handler calls `Email.create`
 * and `User.create`). Green once the domain is filled.
 */
describe('RegisterUserHandler', () => {
  const tokens: IssuedTokens = { accessToken: 'a.jwt', refreshToken: 'r.jwt' };

  function build() {
    const users: jest.Mocked<UserRepositoryPort> = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const hasher: jest.Mocked<PasswordHasherPort> = {
      hash: jest.fn(),
      compare: jest.fn(),
    };
    const tokenPort: jest.Mocked<AuthTokenPort> = {
      issueTokens: jest.fn().mockReturnValue(tokens),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    };
    const handler = new RegisterUserHandler(users, hasher, tokenPort);
    return { handler, users, hasher, tokenPort };
  }

  it('hashes the password, saves the user, and returns the safe user + tokens', async () => {
    const { handler, users, hasher } = build();
    users.findByEmail.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('bcrypt-digest');

    const result = await handler.execute(
      new RegisterUserCommand('New@Example.com', 'password123', 'host'),
    );

    // Email is normalized before the uniqueness check.
    expect(users.findByEmail).toHaveBeenCalledWith('new@example.com');
    expect(hasher.hash).toHaveBeenCalledWith('password123');
    expect(users.save).toHaveBeenCalledTimes(1);

    const saved = users.save.mock.calls[0][0] as User;
    expect(saved.email.value).toBe('new@example.com');
    expect(saved.passwordHash).toBe('bcrypt-digest');
    expect(saved.role).toBe(Role.Host);

    expect(result.user).toEqual({
      id: saved.id,
      email: 'new@example.com',
      role: 'host',
    });
    expect(result.tokens).toBe(tokens);
  });

  it('defaults an unknown/guest role to Guest', async () => {
    const { handler, users, hasher } = build();
    users.findByEmail.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('digest');

    await handler.execute(
      new RegisterUserCommand('g@example.com', 'password123', 'guest'),
    );

    const saved = users.save.mock.calls[0][0] as User;
    expect(saved.role).toBe(Role.Guest);
  });

  it('rejects a duplicate email with EmailAlreadyInUseException (no save)', async () => {
    const { handler, users, hasher } = build();
    const existing = User.create({
      email: Email.create('taken@example.com'),
      passwordHash: 'x',
      role: Role.Guest,
    });
    users.findByEmail.mockResolvedValue(existing);

    await expect(
      handler.execute(
        new RegisterUserCommand('taken@example.com', 'password123', 'guest'),
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseException);

    expect(hasher.hash).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  });
});
