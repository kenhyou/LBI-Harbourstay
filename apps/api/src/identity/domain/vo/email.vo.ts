/**
 * `Email` value object (BC-7). An email address that is *guaranteed* valid and
 * *normalized* once constructed. Two Emails are equal by their normalized value.
 */
export class Email {
  private constructor(private readonly _value: string) {}

  /**
   * Validate + normalize a raw, user-supplied address into an `Email`.
   * Normalization: trim surrounding whitespace and lowercase. Reject anything
   * that is not a syntactically valid address by throwing (a plain `Error` is
   * fine — this is a VO guard, not a domain-exception case).
   */
  static create(raw: string): Email {
    // trim + lowercase, validate the format, throw on invalid.

    const normalized = raw.trim().toLowerCase();

    // pragmatic format check — not full RFC 5322
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      throw new Error(`Invalid email format: ${raw}`);
    }

    return new Email(normalized);
  }

  /**
   * Rebuild an `Email` from a value already persisted in the DB. The stored
   * value is trusted to be normalized/valid, so this skips validation — do NOT
   * re-run the format guard here (that is `create`'s job at the boundary).
   */
  static reconstitute(value: string): Email {
    return new Email(value);
  }

  /** The normalized address (lowercased, trimmed). */
  get value(): string {
    return this._value;
  }

  /** Value equality: two Emails match iff their normalized values are equal. */
  equals(other: Email): boolean {
    return this._value === other._value;
  }
}
