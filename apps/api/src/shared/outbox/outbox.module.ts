import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { OutboxPort } from '@/shared/outbox/outbox.port';
import { PrismaOutbox } from '@/shared/outbox/prisma-outbox';
import { OutboxRelay } from '@/shared/outbox/outbox-relay';

/**
 * Wires the Transactional Outbox once for the app. Binds `OutboxPort` to its
 * Prisma impl (writers `enqueue` inside their own txn) and registers the polling
 * relay. Exports `OutboxPort` so any BC's application layer can enqueue events;
 * the relay runs on the schedule (`ScheduleModule` is registered in AppModule).
 */
@Module({
  imports: [CqrsModule, PrismaModule],
  providers: [
    { provide: OutboxPort, useClass: PrismaOutbox },
    OutboxRelay,
  ],
  exports: [OutboxPort, OutboxRelay],
})
export class OutboxModule {}
