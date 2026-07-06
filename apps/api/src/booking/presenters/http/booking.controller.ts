import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  createBookingRequest,
  type AuthUser,
  type BookingSummary,
  type CreateBookingRequest,
} from '@harbourstay/shared';
import { ZodValidationPipe } from '@/shared/pipes/zod-validation.pipe';
import { BookingService } from '@/booking/application/services/booking.service';
import { BookingExceptionFilter } from '@/booking/presenters/http/filters/booking-exception.filter';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { CurrentUser } from '@/identity/presenters/http/decorators/current-user.decorator';

/**
 * BC-1 HTTP surface. `POST /bookings` is auth-guarded: the guest identity is
 * taken from the session cookie (`@CurrentUser`), NEVER from the body. The body
 * is validated against the shared `createBookingRequest` contract; the response
 * is the `bookingSummary` read model. Domain rule breaks are mapped to statuses
 * by `BookingExceptionFilter` (overbooking → 409, over-capacity → 422, …).
 */
@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtCookieGuard)
@UseFilters(BookingExceptionFilter)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Place a hold and create a PendingPayment booking (Partnership seam).',
  })
  @ApiCreatedResponse({ description: 'The pending-payment booking summary.' })
  @ApiConflictResponse({ description: 'Dates overlap an existing hold or are blocked.' })
  @ApiUnprocessableEntityResponse({ description: 'Party size exceeds listing capacity.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  create(
    @CurrentUser() user: AuthUser,
    // Scope the Zod pipe to the body only — a method-level pipe would also
    // (wrongly) validate the `@CurrentUser` object against the request schema.
    @Body(new ZodValidationPipe(createBookingRequest)) body: CreateBookingRequest,
  ): Promise<BookingSummary> {
    return this.bookings.create(user.id, body);
  }

  @Get(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Read one of the current guest\'s own bookings.' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiOkResponse({ description: 'The booking summary.' })
  @ApiNotFoundResponse({ description: 'No such booking owned by the current guest.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  async getById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<BookingSummary> {
    const booking = await this.bookings.getById(user.id, id);
    if (!booking) {
      // 404 (not 403) whether the id is unknown OR owned by another guest — never
      // reveal the existence of someone else's booking.
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }
}
