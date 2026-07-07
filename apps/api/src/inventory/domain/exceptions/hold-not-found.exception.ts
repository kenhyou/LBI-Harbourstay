import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * KEN'S FILL FILE — stub. Raised when a hold lookup by id finds nothing. The
 * HTTP filter maps it to `404 Not Found`.
 */
export class HoldNotFoundException extends DomainException {
  readonly code = 'HOLD_NOT_FOUND';

  constructor(id: string) {
    super(`Hold not found: ${id}`);
  }
}
