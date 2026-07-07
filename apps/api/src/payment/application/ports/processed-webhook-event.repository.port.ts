import { ProcessedWebhookEvent } from '@/payment/domain/models/processed-webhook-event.model';

/**
 * Persistence port for the `ProcessedWebhookEvent` idempotency ledger (BC-3).
 * `exists` + `record` run inside the webhook transaction so the dedup check and
 * the Payment mutation commit atomically — a duplicate Stripe delivery can never
 * be processed twice.
 */
export abstract class ProcessedWebhookEventRepositoryPort {
  /** True if this Stripe `event.id` was already handled. */
  abstract exists(eventId: string): Promise<boolean>;

  /** Append the ledger row (unique on eventId). */
  abstract record(event: ProcessedWebhookEvent): Promise<void>;
}
