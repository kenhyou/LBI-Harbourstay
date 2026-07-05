import { Injectable } from '@nestjs/common';
import type { AuthUser, Role as ContractRole } from '@harbourstay/shared';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { UserQueryPort } from '@/identity/application/ports/user.query.port';

/**
 * CQRS read impl for BC-7. Projects a Prisma row DIRECTLY into the SAFE
 * `AuthUser` read model — no mapper, no aggregate, no reconstitution, and
 * crucially it `select`s only the safe columns so `passwordHash` never leaves
 * the DB.
 */
@Injectable()
export class UserQuery extends UserQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findAuthUserById(id: string): Promise<AuthUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      role: row.role as unknown as ContractRole,
    };
  }
}
