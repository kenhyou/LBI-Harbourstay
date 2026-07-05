import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised by `RegisterUser` when the submitted email is already registered.
 * The HTTP exception filter maps this (by `instanceof`) to `409 Conflict`.
 */
export class EmailAlreadyInUseException extends DomainException {
  readonly code = 'EMAIL_ALREADY_IN_USE';

  constructor(email: string) {
    super(`Email already in use: ${email}`);
  }
}
