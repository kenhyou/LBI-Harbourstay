/**
 * In-process event the Outbox relay publishes on the CQRS `EventBus` for each
 * unsent row. Generic on purpose — the relay knows nothing about specific event
 * types; consumers (`@EventsHandler`) filter on `type` (e.g. `'BookingConfirmed'`)
 * and dedup on `id` (the outbox row id) to stay idempotent under at-least-once
 * delivery.
 */
export class OutboxEventPublished {
  constructor(
    /** The outbox row id — the delivery idempotency key for consumers. */
    public readonly id: string,
    public readonly type: string,
    public readonly aggregateId: string,
    public readonly payload: Record<string, unknown>,
  ) {}
}
