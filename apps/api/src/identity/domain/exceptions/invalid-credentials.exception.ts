import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised by `LoginUser` when the email is unknown OR the password does not
 * match. Deliberately does NOT distinguish the two cases (no user enumeration).
 * The HTTP exception filter maps this (by `instanceof`) to `401 Unauthorized`.
 */
export class InvalidCredentialsException extends DomainException {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Invalid credentials. Please check your email and password.');
  }
}
