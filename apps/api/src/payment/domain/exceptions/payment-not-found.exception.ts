import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * KEN'S FILL FILE — stub. Raised when a Payment lookup by id (or by Stripe intent)
 * finds nothing. The HTTP filter maps it to `404 Not Found`.
 *
 * TODO(you): call `super(...)` with a message like `Payment not found: ${id}` and
 * delete the throw. Keep the `code` — the filter branches on it.
 */
export class PaymentNotFoundException extends DomainException {
  readonly code = 'PAYMENT_NOT_FOUND';

  constructor(id: string) {
    super(`Payment not found: ${id}`);
  }
}
