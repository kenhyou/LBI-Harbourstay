/**
 * Password hashing port (BC-7). Hashing/verification is an infra concern —
 * the domain never sees a plaintext password nor a hashing library. Speaks
 * primitives only. Bound to the bcrypt impl in the identity module.
 */
export abstract class PasswordHasherPort {
  /** Hash a plaintext password into a storable, opaque digest. */
  abstract hash(plain: string): Promise<string>;

  /** Constant-time compare a plaintext against a stored digest. */
  abstract compare(plain: string, hash: string): Promise<boolean>;
}
