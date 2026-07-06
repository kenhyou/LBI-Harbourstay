import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * KEN'S FILL FILE — stub. Raised at booking creation when the requested party
 * size is larger than the listing's capacity (a cross-aggregate check the app
 * service performs after loading capacity). The HTTP filter maps it to
 * `422 Unprocessable Entity`.
 *
 * TODO(you): call `super(...)` with a message like
 * `Party size ${partySize} exceeds capacity ${capacity}` and delete the throw.
 * Keep the `code`.
 */
export class PartySizeExceedsCapacityException extends DomainException {
  readonly code = 'PARTY_SIZE_EXCEEDS_CAPACITY';

  constructor(partySize: number, capacity: number) {
    super(`Party size ${partySize} exceeds capacity ${capacity}`);
  }
}
