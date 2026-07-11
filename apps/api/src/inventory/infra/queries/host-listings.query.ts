import { Injectable } from '@nestjs/common';
import type {
  HostListingDetail,
  HostListingSummary,
  ListingStatus as ContractListingStatus,
  ListingType as ContractListingType,
} from '@harbourstay/shared';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { HostListingsQueryPort } from '@/inventory/application/ports/host-listings.query.port';

/**
 * CQRS read impl for the host dashboard. Projects Prisma `listing` rows owned by
 * `hostId` DIRECTLY into the `hostListingSummary` contract DTO — no mapper, no
 * aggregate, no reconstitution (that's the point of the read side: skip the write
 * model entirely). Prisma lives only here.
 *
 * Scoped to the owner in the WHERE clause, and — unlike the guest catalog read
 * (S1) — NOT filtered to Published: a host sees their drafts too.
 */
@Injectable()
export class HostListingsQuery extends HostListingsQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForHost(hostId: string): Promise<HostListingSummary[]> {
    const rows = await this.prisma.listing.findMany({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        location: true,
        type: true,
        capacity: true,
        basePrice: true,
        status: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      location: row.location,
      // DB enum values equal the contract strings — a safe cast at the read edge.
      type: row.type as unknown as ContractListingType,
      capacity: row.capacity,
      basePrice: row.basePrice,
      status: row.status as unknown as ContractListingStatus,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getDetailForHost(
    id: string,
    hostId: string,
  ): Promise<HostListingDetail | null> {
    // Ownership is in the WHERE clause: an id owned by another host simply isn't
    // found → null → 404 (no-leak). NOT filtered to Published — drafts are the
    // whole point of the edit-prefill read.
    const row = await this.prisma.listing.findFirst({
      where: { id, hostId },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        type: true,
        capacity: true,
        basePrice: true,
        images: true,
        status: true,
        createdAt: true,
      },
    });
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      type: row.type as unknown as ContractListingType,
      capacity: row.capacity,
      basePrice: row.basePrice,
      images: row.images,
      status: row.status as unknown as ContractListingStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
