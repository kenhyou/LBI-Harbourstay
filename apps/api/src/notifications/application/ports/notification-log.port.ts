/**
 * BC-8 delivery ledger port. Makes outbox consumption idempotent: keyed on the
 * outbox event id, so an at-least-once redelivery never double-sends. `markProcessed`
 * is safe under a race (a duplicate insert is swallowed by the impl).
 */
export abstract class NotificationLogPort {
  abstract alreadyProcessed(eventId: string): Promise<boolean>;
  abstract markProcessed(eventId: string, type: string): Promise<void>;
}
