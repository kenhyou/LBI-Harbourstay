/**
 * KEN'S FILL FILE — stub. `ProcessedWebhookEvent` — the tiny idempotency-ledger
 * aggregate (BC-3). One instance per handled Stripe `event.id`. Persisted with a
 * PK/unique on `eventId`, so a duplicate webhook delivery is a no-op: the handler
 * checks for the row and skips if present. Smallest possible aggregate.
 * Your spec is `processed-webhook-event.model.spec.ts`.
 *
 * API to implement:
 * - `create(eventId)` — a new ledger entry stamped `processedAt = new Date()`
 *   (reject an empty eventId).
 * - `reconstitute(eventId, processedAt)` — rebuild from the stored row.
 * - `eventId` / `processedAt` getters.
 */
export class ProcessedWebhookEvent {
  private constructor(
    private readonly _eventId: string,
    private readonly _processedAt: Date,
  ) {}

  static create(eventId: string): ProcessedWebhookEvent {
    if (!eventId || eventId.trim().length === 0) {
      throw new Error('eventId cannot be empty.');
    }
    return new ProcessedWebhookEvent(eventId, new Date());
  }

  static reconstitute(
    eventId: string,
    processedAt: Date,
  ): ProcessedWebhookEvent {
    return new ProcessedWebhookEvent(eventId, new Date(processedAt));
  }

  get eventId(): string {
    return this._eventId;
  }

  get processedAt(): Date {
    return new Date(this._processedAt);
  }
}
