import { GetCurrentUserHandler } from './get-current-user.query.handler';
import { GetCurrentUserQuery } from '@/identity/application/queries/get-current-user.query';
import type { UserQueryPort } from '@/identity/application/ports/user.query.port';
import { UserNotFoundException } from '@/identity/domain/exceptions/user-not-found.exception';
import type { AuthUser } from '@harbourstay/shared';

/**
 * Query handler spec. Pure — the Query Port is mocked and returns a read-model
 * DTO (no domain reconstitution). Green now (independent of Ken's domain fill).
 */
describe('GetCurrentUserHandler', () => {
  const authUser: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'me@example.com',
    role: 'guest',
  };

  it('returns the projected safe user from the query port', async () => {
    const users: jest.Mocked<UserQueryPort> = {
      findAuthUserById: jest.fn().mockResolvedValue(authUser),
    };
    const handler = new GetCurrentUserHandler(users);

    const result = await handler.execute(new GetCurrentUserQuery(authUser.id));

    expect(users.findAuthUserById).toHaveBeenCalledWith(authUser.id);
    expect(result).toBe(authUser);
  });

  it('throws UserNotFound when the subject no longer exists', async () => {
    const users: jest.Mocked<UserQueryPort> = {
      findAuthUserById: jest.fn().mockResolvedValue(null),
    };
    const handler = new GetCurrentUserHandler(users);

    await expect(
      handler.execute(new GetCurrentUserQuery('missing')),
    ).rejects.toBeInstanceOf(UserNotFoundException);
  });
});
