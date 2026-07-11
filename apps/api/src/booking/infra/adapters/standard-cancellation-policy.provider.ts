import { Injectable } from '@nestjs/common';
import { CancellationPolicyProviderPort } from '@/booking/application/ports/cancellation-policy.provider.port';
import { CancellationPolicy } from '@/booking/domain/policies/cancellation-policy';

/**
 * MVP impl of `CancellationPolicyProviderPort`: hands back the single
 * `CancellationPolicy.standard()` for every listing (ignores `listingId`). This
 * is the seam where a future per-listing policy would be loaded from the store —
 * hence the async signature and its home under `infra/adapters`. No Prisma yet.
 */
@Injectable()
export class StandardCancellationPolicyProvider extends CancellationPolicyProviderPort {
  async forListing(listingId: string): Promise<CancellationPolicy> {
    void listingId;
    return CancellationPolicy.standard();
  }
}
