import type { User as UserRow, UserRole } from '@prisma/client';
import { User } from '@/identity/domain/models/user.model';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';

/**
 * Translates between the Prisma `user` row and the `User` aggregate. The ONLY
 * place the write side crosses the Prisma↔domain boundary (Prisma types live in
 * infra). Restore uses `reconstitute` (trusted stored values, no re-validation).
 */
export class UserMapper {
  static toDomain(row: UserRow): User {
    return User.reconstitute({
      id: row.id,
      email: Email.reconstitute(row.email),
      passwordHash: row.passwordHash,
      role: row.role as unknown as Role,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(user: User): UserRow {
    return {
      id: user.id,
      email: user.email.value,
      passwordHash: user.passwordHash,
      role: user.role as unknown as UserRole,
      createdAt: user.createdAt,
    };
  }
}
