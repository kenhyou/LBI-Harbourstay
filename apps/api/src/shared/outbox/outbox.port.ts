/**
 * Transactional Outbox write port (cross-cutting infra, not a BC). Application
 * code (e.g. `BookingCheckoutSaga`) calls `enqueue` INSIDE a
 * `TransactionManagerPort.run` boundary; the Prisma impl writes the row via the
 * ambient transactional client, so the event row commits ATOMICALLY with the
 * aggregate change. A separate polling relay later publishes unsent rows.
 *
 * Payload is JSON of PRIMITIVES ONLY — it serializes into the row and may cross a
 * BC boundary (Booking → Notifications). No VOs, no domain objects.
 */
export abstract class OutboxPort {
  /**
   * Append an event to the outbox in the current transaction.
   * @param type stable event type string (e.g. `'BookingConfirmed'`)
   * @param aggregateId the source aggregate's id (used as the correlation key)
   * @param payload primitives-only JSON payload
   */
  abstract enqueue(
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
