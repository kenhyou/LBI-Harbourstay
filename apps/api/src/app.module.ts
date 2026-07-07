import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { TransactionModule } from '@/shared/transaction/transaction.module';
import { OutboxModule } from '@/shared/outbox/outbox.module';
import { HealthModule } from '@/health/health.module';
import { CatalogModule } from '@/catalog/catalog.module';
import { IdentityModule } from '@/identity/identity.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { BookingModule } from '@/booking/booking.module';
import { PaymentModule } from '@/payment/payment.module';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    PrismaModule,
    TransactionModule,
    OutboxModule,
    HealthModule,
    CatalogModule,
    IdentityModule,
    InventoryModule,
    BookingModule,
    PaymentModule,
    NotificationsModule,
  ],
})
export class AppModule {}
