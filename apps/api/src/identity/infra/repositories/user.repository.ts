import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { UserRepositoryPort } from '@/identity/application/ports/user.repository.port';
import { UserMapper } from '@/identity/infra/mappers/user.mapper';
import { User } from '@/identity/domain/models/user.model';

/**
 * Prisma-backed write repository for the `User` aggregate (BC-7). Implements the
 * port; maps rows↔domain via `UserMapper`. Prisma lives only here.
 */
@Injectable()
export class UserRepository extends UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const data = UserMapper.toPersistence(user);
    await this.prisma.user.upsert({
      where: { id: data.id },
      create: data,
      update: {
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
      },
    });
  }
}
