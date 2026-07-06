import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { TransactionModule } from '@/shared/transaction/transaction.module';
import { HealthModule } from '@/health/health.module';
import { CatalogModule } from '@/catalog/catalog.module';
import { IdentityModule } from '@/identity/identity.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { BookingModule } from '@/booking/booking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    HealthModule,
    CatalogModule,
    IdentityModule,
    InventoryModule,
    BookingModule,
  ],
})
export class AppModule {}
