import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AuthUser } from '@harbourstay/shared';
import { GetCurrentUserQuery } from '@/identity/application/queries/get-current-user.query';
import { UserQueryPort } from '@/identity/application/ports/user.query.port';
import { UserNotFoundException } from '@/identity/domain/exceptions/user-not-found.exception';

/**
 * Read handler for `GET /auth/me`. Projects via the Query Port (no domain
 * reconstitution). A token whose subject no longer exists → `UserNotFound`
 * (404).
 */
@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler
  implements IQueryHandler<GetCurrentUserQuery, AuthUser>
{
  constructor(private readonly users: UserQueryPort) {}

  async execute(query: GetCurrentUserQuery): Promise<AuthUser> {
    const user = await this.users.findAuthUserById(query.userId);
    if (!user) {
      throw new UserNotFoundException(query.userId);
    }
    return user;
  }
}
