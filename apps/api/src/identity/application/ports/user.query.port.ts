import type { AuthUser } from '@harbourstay/shared';

/**
 * CQRS read port for BC-7. Projects the SAFE `AuthUser` read model straight
 * from the store — it NEVER reconstitutes the `User` aggregate (that is the
 * write side's job). Bound to its Prisma impl in the identity module.
 */
export abstract class UserQueryPort {
  /** Project the safe user shape by id, or `null` if none exists. */
  abstract findAuthUserById(id: string): Promise<AuthUser | null>;
}
