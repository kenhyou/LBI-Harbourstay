import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { throttlerRootOptions } from '@/shared/throttler/throttler.config';
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
    // Global rate limiting (S7a). The default tier (~100/min/IP) is defined here;
    // the tighter auth tier is applied with `@Throttle` on `AuthController`, and
    // `/health` + `/webhooks/stripe` opt out with `@SkipThrottle` (see those
    // controllers for why). Enforced by the `ThrottlerGuard` registered as an
    // APP_GUARD below, so no route can forget it.
    ThrottlerModule.forRoot(throttlerRootOptions()),
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
  providers: [
    // Register the throttler as a GLOBAL guard. It runs BEFORE the route-level
    // JwtCookieGuard/RolesGuard, so an abusive client is rejected with 429 before
    // we spend any work on authentication — and it composes cleanly with them.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
