import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  availabilityQuery,
  type AvailabilityQuery as AvailabilityQueryDto,
  type ListingAvailability,
} from '@harbourstay/shared';
import { ZodValidationPipe } from '@/shared/pipes/zod-validation.pipe';
import { AvailabilityService } from '@/inventory/application/services/availability.service';

/**
 * BC-2 availability read surface. `GET /listings/:id/availability?from&to` — the
 * `from`/`to` window is validated against the shared `availabilityQuery`
 * contract; the response is the contract-shaped `ListingAvailability` read model
 * (INDICATIVE; re-verified at booking time by the DB EXCLUDE).
 */
@ApiTags('availability')
@Controller('listings')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get(':id/availability')
  @ApiOperation({ summary: 'Taken date ranges for a listing in a window.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'YYYY-MM-DD' })
  @ApiOkResponse({ description: 'The unavailable ranges to disable on the calendar.' })
  getAvailability(
    @Param('id') id: string,
    // Scope the Zod pipe to the query param only — a method-level pipe would also
    // (wrongly) validate the string `:id` against this object schema.
    @Query(new ZodValidationPipe(availabilityQuery)) window: AvailabilityQueryDto,
  ): Promise<ListingAvailability> {
    return this.availability.getAvailability(id, window);
  }
}
