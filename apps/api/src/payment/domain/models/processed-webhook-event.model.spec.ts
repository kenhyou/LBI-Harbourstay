import { ProcessedWebhookEvent } from './processed-webhook-event.model';

/**
 * KEN'S EXECUTABLE SPEC for the `ProcessedWebhookEvent` idempotency-ledger
 * aggregate. Pure unit — ZERO mocks. RED until you implement the model.
 */
describe('ProcessedWebhookEvent (aggregate)', () => {
  it('creates from a Stripe event id and stamps processedAt', () => {
    const before = Date.now();
    const event = ProcessedWebhookEvent.create('evt_test_123');
    const after = Date.now();

    expect(event.eventId).toBe('evt_test_123');
    expect(event.processedAt).toBeInstanceOf(Date);
    expect(event.processedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(event.processedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('rejects an empty event id', () => {
    expect(() => ProcessedWebhookEvent.create('')).toThrow();
  });

  it('reconstitutes from stored values', () => {
    const processedAt = new Date('2026-07-01T00:00:00.000Z');
    const event = ProcessedWebhookEvent.reconstitute('evt_stored', processedAt);
    expect(event.eventId).toBe('evt_stored');
    expect(event.processedAt.getTime()).toBe(processedAt.getTime());
  });
});
