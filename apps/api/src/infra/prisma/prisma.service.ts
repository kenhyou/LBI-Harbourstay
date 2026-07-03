import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Nest provider wrapping the Prisma client. The ONLY place PrismaClient is
 * constructed. Repositories (infra layer, S1+) depend on this; domain and
 * application layers never see it. Not wired into AppModule until S1, so the
 * API still boots without a database during P0.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
