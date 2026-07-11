import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser, HostBookingsResponse } from '@harbourstay/shared';
import { BookingService } from '@/booking/application/services/booking.service';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { RolesGuard } from '@/identity/presenters/http/guards/roles.guard';
import { Roles } from '@/identity/presenters/http/decorators/roles.decorator';
import { CurrentUser } from '@/identity/presenters/http/decorators/current-user.decorator';

/**
 * BC-1 host-facing read surface. Separate from `BookingController` (guest-only,
 * `JwtCookieGuard` alone) because this route needs the SECOND authorization layer:
 * the same class-level `RolesGuard` + `@Roles('host')` stack the host-listings
 * controller uses (anon → 401, signed-in guest → 403). Keeping it a sibling
 * controller means the host RBAC is declared once at the class, not bolted onto a
 * single method inside the guest controller.
 *
 * There is NO per-listing ownership param to leak here: the host identity comes
 * from `@CurrentUser()`, and the query returns only bookings on the host's own
 * listings — a host physically cannot address another host's bookings.
 */
@ApiTags('host-bookings')
@Controller('host/bookings')
@UseGuards(JwtCookieGuard, RolesGuard)
@Roles('host')
export class HostBookingController {
  constructor(private readonly bookings: BookingService) {}

  @Get()
  @ApiCookieAuth()
  @ApiOperation({
    summary: "List bookings across the current host's listings (newest first).",
  })
  @ApiOkResponse({ description: "The host's cross-listing bookings." })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  listForHost(@CurrentUser() user: AuthUser): Promise<HostBookingsResponse> {
    return this.bookings.listForHost(user.id);
  }
}
