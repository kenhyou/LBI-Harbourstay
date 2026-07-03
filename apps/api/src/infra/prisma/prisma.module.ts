import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so any BC's infra layer can inject PrismaService without re-importing.
 * Wired into AppModule starting S1 (the first slice with a repository).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
