import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ClsTransactionManager } from '@/shared/transaction/cls-transaction-manager';

/**
 * Wires the CLS transaction plugin over Prisma ONCE for the whole app (P0
 * deferred this to the first cross-aggregate write — S3). `global: true` makes
 * `TransactionHost` injectable in any BC's infra repository; the plugin reads
 * `PrismaService` (the single PrismaClient) as its connection. Application code
 * only ever sees `TransactionManagerPort`.
 */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaService,
          }),
        }),
      ],
    }),
  ],
  providers: [
    { provide: TransactionManagerPort, useClass: ClsTransactionManager },
  ],
  exports: [TransactionManagerPort],
})
export class TransactionModule {}
