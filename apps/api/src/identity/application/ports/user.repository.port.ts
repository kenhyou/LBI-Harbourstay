import { User } from '@/identity/domain/models/user.model';

/**
 * Write-side persistence port for the `User` aggregate (BC-7). Bound to its
 * Prisma impl in exactly one module. Speaks the domain aggregate (in/out) — the
 * mapper (infra) translates to/from Prisma rows. Lookups take primitive keys.
 */
export abstract class UserRepositoryPort {
  /** Load by normalized email, or `null` if none. Used for login + uniqueness. */
  abstract findByEmail(email: string): Promise<User | null>;

  /** Load by id, or `null` if none. Used by the /me + refresh paths. */
  abstract findById(id: string): Promise<User | null>;

  /** Insert or update the aggregate. */
  abstract save(user: User): Promise<void>;
}
