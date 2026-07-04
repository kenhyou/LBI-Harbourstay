import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  listingSearchQuery,
  type ListingDetail,
  type ListingSearchQuery,
  type ListingSummary,
} from '@harbourstay/shared';
import { ZodValidationPipe } from '@/shared/pipes/zod-validation.pipe';
import { ListingService } from '@/catalog/application/services/listing.service';

/**
 * BC-5 read-side HTTP surface. Query params are validated against the shared
 * Zod contract; responses are contract-shaped Read Models. No domain here.
 */
@ApiTags('listings')
@Controller('listings')
export class ListingController {
  constructor(private readonly listings: ListingService) {}

  @Get()
  @ApiOperation({ summary: 'Search Published listings (all filters optional).' })
  @ApiQuery({ name: 'location', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'guests', required: false, type: Number })
  @ApiOkResponse({ description: 'Matching search cards.' })
  @UsePipes(new ZodValidationPipe(listingSearchQuery))
  search(@Query() query: ListingSearchQuery): Promise<ListingSummary[]> {
    return this.listings.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one Published listing detail (404 otherwise).' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiOkResponse({ description: 'The full listing detail.' })
  @ApiNotFoundResponse({ description: 'No Published listing with that id.' })
  async getDetail(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ListingDetail> {
    const detail = await this.listings.getDetail(
      id,
      from && to ? { from, to } : undefined,
    );
    if (!detail) {
      throw new NotFoundException(`Listing ${id} not found`);
    }
    return detail;
  }
}
