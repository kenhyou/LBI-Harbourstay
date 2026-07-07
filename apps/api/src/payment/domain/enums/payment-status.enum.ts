/**
 * BC-3 Payment lifecycle status. Values match the Postgres `PaymentStatus` enum
 * (same strings), so the mapper is a straight cast.
 *
 * State graph:
 *   Pending --markSucceeded()--> Succeeded   (terminal)
 *   Pending --markFailed()-----> Failed      (terminal)
 *
 * `markSucceeded()`/`markFailed()` are IDEMPOTENT: re-applying the same terminal
 * state is a no-op, not an error; a conflicting transition (e.g. Succeeded → Failed)
 * throws `InvalidPaymentStateException`.
 */
export enum PaymentStatus {
  Pending = 'Pending',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}
