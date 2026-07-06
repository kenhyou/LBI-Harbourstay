import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';

/**
 * Infra impl of `TransactionManagerPort` backed by `@nestjs-cls/transactional`.
 * `withTransaction` opens a Prisma transaction, stores the transactional client
 * in CLS, and runs `work`; any repository that reads `TransactionHost.tx` inside
 * that scope transparently joins the same transaction. The only place the CLS
 * transaction library is referenced from our own code besides the module wiring.
 */
@Injectable()
export class ClsTransactionManager extends TransactionManagerPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.txHost.withTransaction(work);
  }
}
