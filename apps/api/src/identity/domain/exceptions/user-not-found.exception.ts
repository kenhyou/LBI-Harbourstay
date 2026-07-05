import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised when a user referenced by id (e.g. from a valid token whose subject no
 * longer exists) cannot be loaded. The HTTP exception filter maps this (by
 * `instanceof`) to `404 Not Found`.
 */
export class UserNotFoundException extends DomainException {
  readonly code = 'USER_NOT_FOUND';

  constructor(userId: string) {
    super(`User not found: ${userId}`);
  }
}
