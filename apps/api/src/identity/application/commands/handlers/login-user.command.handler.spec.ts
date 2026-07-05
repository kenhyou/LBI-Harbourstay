import { LoginUserHandler } from './login-user.command.handler';
import { LoginUserCommand } from '@/identity/application/commands/login-user.command';
import type { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import type { PasswordHasherPort } from '@/identity/application/ports/password-hasher.port';
import type {
  AuthTokenPort,
  IssuedTokens,
} from '@/identity/application/ports/auth-token.port';
import { InvalidCredentialsException } from '@/identity/domain/exceptions/invalid-credentials.exception';
import { User } from '@/identity/domain/models/user.model';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';

/**
 * Handler spec: ports mocked, real domain. RED until Ken implements `Email` +
 * `User`; green once the domain is filled.
 */
describe('LoginUserHandler', () => {
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
    return { handler: new LoginUserHandler(users, hasher, tokenPort), users, hasher, tokenPort };
  }

  function existingUser() {
    return User.create({
      email: Email.create('user@example.com'),
      passwordHash: 'stored-digest',
      role: Role.Guest,
    });
  }

  it('returns the safe user + tokens on a correct password', async () => {
    const { handler, users, hasher, tokenPort } = build();
    const user = existingUser();
    users.findByEmail.mockResolvedValue(user);
    hasher.compare.mockResolvedValue(true);

    const result = await handler.execute(
      new LoginUserCommand('User@Example.com', 'correct-password'),
    );

    expect(users.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(hasher.compare).toHaveBeenCalledWith('correct-password', 'stored-digest');
    expect(result.user).toEqual({ id: user.id, email: 'user@example.com', role: 'guest' });
    expect(tokenPort.issueTokens).toHaveBeenCalledWith({
      sub: user.id,
      email: 'user@example.com',
      role: 'guest',
    });
    expect(result.tokens).toBe(tokens);
  });

  it('throws InvalidCredentials for an unknown email (no enumeration)', async () => {
    const { handler, users, hasher } = build();
    users.findByEmail.mockResolvedValue(null);

    await expect(
      handler.execute(new LoginUserCommand('nobody@example.com', 'whatever')),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(hasher.compare).not.toHaveBeenCalled();
  });

  it('throws InvalidCredentials when the password does not match', async () => {
    const { handler, users, hasher, tokenPort } = build();
    users.findByEmail.mockResolvedValue(existingUser());
    hasher.compare.mockResolvedValue(false);

    await expect(
      handler.execute(new LoginUserCommand('user@example.com', 'wrong')),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(tokenPort.issueTokens).not.toHaveBeenCalled();
  });
});
