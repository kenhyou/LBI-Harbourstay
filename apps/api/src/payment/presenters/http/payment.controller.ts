import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser, CreatePaymentIntentResponse } from '@harbourstay/shared';
import { PaymentService } from '@/payment/application/services/payment.service';
import { PaymentExceptionFilter } from '@/payment/presenters/http/filters/payment-exception.filter';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { CurrentUser } from '@/identity/presenters/http/decorators/current-user.decorator';

/**
 * BC-3 HTTP surface for opening a payment. `POST /bookings/:id/pay` is
 * auth-guarded; the guest identity comes from the session cookie (ownership
 * check), never the body. Returns the Stripe client secret + our internal
 * paymentId. (The webhook lives on its own unguarded controller.)
 */
@ApiTags('payments')
@Controller('bookings')
@UseGuards(JwtCookieGuard)
@UseFilters(PaymentExceptionFilter)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post(':id/pay')
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Create a Stripe PaymentIntent (test mode) for a pending booking.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiCreatedResponse({ description: 'Client secret + internal paymentId.' })
  @ApiNotFoundResponse({ description: 'No such booking owned by the current guest.' })
  @ApiConflictResponse({ description: 'Booking is not in a payable state.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  createIntent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<CreatePaymentIntentResponse> {
    return this.payments.createIntent(id, user.id);
  }
}
