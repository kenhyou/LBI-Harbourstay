import { DomainException } from '@/shared/exceptions/domain.exception';
import type { PaymentStatus } from '@/payment/domain/enums/payment-status.enum';

/**
 * KEN'S FILL FILE — stub. Raised when a `Payment` transition is attempted that the
 * current status forbids — specifically a CONFLICTING terminal move (e.g.
 * `markFailed()` on an already-Succeeded payment). Re-applying the SAME terminal
 * state is NOT an error (idempotent no-op) and must never construct this. The HTTP
 * filter maps it to `409 Conflict`.
 *
 * TODO(you): call `super(...)` with a message like
 * `Cannot ${attempted} a payment in '${from}' state` and delete the throw. Keep
 * the `code` — the filter branches on it.
 */
export class InvalidPaymentStateException extends DomainException {
  readonly code = 'INVALID_PAYMENT_STATE';

  constructor(from: PaymentStatus, attempted: string) {
    super(
      `Cannot make transition to '${attempted}' on a payment in '${from}' state`,
    );
  }
}
