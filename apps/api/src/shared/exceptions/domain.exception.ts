/**
 * Base class for all domain-layer exceptions. Framework-free by design — the
 * domain must never import `@nestjs/common` (see conventions §Backend layering).
 * Presenters/filters map a `DomainException` (and its subclasses) to the right
 * HTTP status at the boundary; the domain only knows it broke an invariant.
 *
 * Each concrete subclass sets a stable `code` (machine-readable, e.g.
 * `EMAIL_ALREADY_IN_USE`) so the HTTP layer can branch without string-matching
 * messages.
 */
export abstract class DomainException extends Error {
  /** Stable, machine-readable identifier for this failure. */
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    // Restore the prototype chain (TS + extending built-in Error) so
    // `instanceof` works against concrete subclasses.
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
