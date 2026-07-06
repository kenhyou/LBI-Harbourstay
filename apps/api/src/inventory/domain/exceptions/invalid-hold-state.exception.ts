import { DomainException } from '@/shared/exceptions/domain.exception';
import type { HoldStatus } from '@/inventory/domain/enums/hold-status.enum';

/**
 * Raised when a `Hold` transition is attempted from a status that does not allow
 * it (e.g. committing a released hold). Mapped to `409 Conflict`.
 */
export class InvalidHoldStateException extends DomainException {
  readonly code = 'INVALID_HOLD_STATE';

  constructor(from: HoldStatus, attempted: string) {
    super(`Cannot ${attempted} a hold in '${from}' state`);
  }
}
