/**
 * BC-7 account role. Mirrors the wire contract `Role` from `@harbourstay/shared`
 * (a plain string union) but lives in the domain as a value-typed enum so the
 * aggregate and guards branch on symbols, not raw strings.
 *
 * Domain note (UL §Guest): this identity `Guest` role is distinct from the
 * Booking booker and from party-size guest counts. `Admin` is never
 * self-registerable — registration only ever accepts `Guest` | `Host`.
 */
export enum Role {
  Guest = 'guest',
  Host = 'host',
  Admin = 'admin',
}

/** All role values, handy for validation/iteration. */
export const ROLE_VALUES: readonly Role[] = Object.freeze([
  Role.Guest,
  Role.Host,
  Role.Admin,
]);

/** Type guard: is an arbitrary string one of the known roles? */
export function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}
