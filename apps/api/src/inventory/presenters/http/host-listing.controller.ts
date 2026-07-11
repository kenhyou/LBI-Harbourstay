import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  availabilityBlockRequest,
  hostListingUpsert,
  type AuthUser,
  type AvailabilityBlockRequest,
  type HostListingDetail,
  type HostListingSummary,
  type HostListingUpsert,
  type HostListingsResponse,
  type ListingBlocksResponse,
} from '@harbourstay/shared';
import { ZodValidationPipe } from '@/shared/pipes/zod-validation.pipe';
import { HostListingService } from '@/inventory/application/services/host-listing.service';
import { ListingExceptionFilter } from '@/inventory/presenters/http/filters/listing-exception.filter';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { RolesGuard } from '@/identity/presenters/http/guards/roles.guard';
import { Roles } from '@/identity/presenters/http/decorators/roles.decorator';
import { CurrentUser } from '@/identity/presenters/http/decorators/current-user.decorator';

/**
 * BC-6 Host Management HTTP surface (BC-2 `Listing` write side). The FIRST real
 * use of the S2 `@Roles('host')` RBAC.
 *
 * TWO guards, in order, on EVERY route (class-level, so it can't be forgotten on a
 * new route):
 *   1. `JwtCookieGuard`  — authenticate from the session cookie (→ 401 if absent).
 *   2. `RolesGuard` + `@Roles('host')` — authorize the ROLE (→ 403 if a signed-in
 *      guest hits `/host/*`). This is the guard-ordering that makes "a guest gets
 *      403, an anonymous request gets 401" fall out correctly.
 *
 * The host identity is ALWAYS taken from `@CurrentUser()` (the verified cookie),
 * NEVER from the body or a param — a client cannot act "as" another host. The
 * per-listing ownership check ("is this YOUR listing?") is enforced deeper, in the
 * command handlers, as a 404-no-leak.
 */
@ApiTags('host-listings')
@Controller('host/listings')
@UseGuards(JwtCookieGuard, RolesGuard)
@Roles('host')
@UseFilters(ListingExceptionFilter)
export class HostListingController {
  constructor(private readonly listings: HostListingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a new listing (starts Unpublished).' })
  @ApiCreatedResponse({ description: 'The created listing summary.' })
  @ApiUnprocessableEntityResponse({ description: 'A listing detail invariant was violated.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  create(
    @CurrentUser() user: AuthUser,
    // Scope the pipe to the body only — a method-level pipe would also (wrongly)
    // try to validate the injected `@CurrentUser` against the schema.
    @Body(new ZodValidationPipe(hostListingUpsert)) body: HostListingUpsert,
  ): Promise<HostListingSummary> {
    return this.listings.create(user.id, body);
  }

  @Get()
  @ApiCookieAuth()
  @ApiOperation({ summary: "List the current host's own listings (newest first, drafts included)." })
  @ApiOkResponse({ description: "The host's listings as summaries." })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  listMine(@CurrentUser() user: AuthUser): Promise<HostListingsResponse> {
    return this.listings.listMine(user.id);
  }

  @Get(':id')
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Read one of the host's own listings in full editable detail (drafts included).",
  })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiOkResponse({ description: 'The full editable listing detail (prefill for the edit form).' })
  @ApiNotFoundResponse({ description: 'No such listing owned by the current host.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  getMine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<HostListingDetail> {
    // Ownership (404-no-leak) is enforced in the query handler.
    return this.listings.getMineDetail(user.id, id);
  }

  @Patch(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Full-replace edit of one of the host\'s own listings.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiOkResponse({ description: 'The updated listing summary.' })
  @ApiUnprocessableEntityResponse({ description: 'A listing detail invariant was violated.' })
  @ApiNotFoundResponse({ description: 'No such listing owned by the current host.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(hostListingUpsert)) body: HostListingUpsert,
  ): Promise<HostListingSummary> {
    // Ownership (404-no-leak) is enforced inside the handler.
    return this.listings.update(user.id, id, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Publish one of the host\'s own listings.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiOkResponse({ description: 'The published listing summary.' })
  @ApiConflictResponse({ description: 'The listing is already Published.' })
  @ApiNotFoundResponse({ description: 'No such listing owned by the current host.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<HostListingSummary> {
    return this.listings.publish(user.id, id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Unpublish one of the host\'s own listings.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiOkResponse({ description: 'The unpublished listing summary.' })
  @ApiConflictResponse({ description: 'The listing is already Unpublished.' })
  @ApiNotFoundResponse({ description: 'No such listing owned by the current host.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<HostListingSummary> {
    return this.listings.unpublish(user.id, id);
  }

  // ── Availability blocks (S6b) ────────────────────────────────────────────────
  // All three routes inherit the class-level guards (host RBAC) and the ownership
  // 404-no-leak (enforced in the handlers/query). The block list is the response of
  // every mutation too, so the client re-syncs in one round trip.

  @Get(':id/blocks')
  @ApiCookieAuth()
  @ApiOperation({ summary: "List the host's blocks on one of their own listings." })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiOkResponse({ description: 'The listing\'s blocks (calendar order).' })
  @ApiNotFoundResponse({ description: 'No such listing owned by the current host.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  listBlocks(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ListingBlocksResponse> {
    return this.listings.listBlocks(user.id, id);
  }

  @Post(':id/blocks')
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Block a date range on one of the host\'s own listings.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiCreatedResponse({ description: 'The updated block list.' })
  @ApiConflictResponse({ description: 'The range overlaps an existing block.' })
  @ApiNotFoundResponse({ description: 'No such listing owned by the current host.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  addBlock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    // Scope the Zod pipe to the body only (as elsewhere — a method-level pipe would
    // also try to validate the injected @CurrentUser against the schema).
    @Body(new ZodValidationPipe(availabilityBlockRequest))
    body: AvailabilityBlockRequest,
  ): Promise<ListingBlocksResponse> {
    return this.listings.addBlock(user.id, id, body);
  }

  @Delete(':id/blocks/:blockId')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Remove one block from the host\'s own listing.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiParam({ name: 'blockId', description: 'Block UUID' })
  @ApiOkResponse({ description: 'The updated block list.' })
  @ApiNotFoundResponse({ description: 'No such listing (not owned) or no such block.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a host.' })
  removeBlock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
  ): Promise<ListingBlocksResponse> {
    return this.listings.removeBlock(user.id, id, blockId);
  }
}
