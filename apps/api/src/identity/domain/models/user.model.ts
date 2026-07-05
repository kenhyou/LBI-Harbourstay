import { randomUUID } from 'node:crypto';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';

/** Props for restoring a `User` from persistence (all fields explicit). */
export interface UserSnapshot {
  id: string;
  email: Email;
  passwordHash: string;
  role: Role;
  createdAt: Date;
}

/** Props for registering a brand-new `User` (no id/createdAt yet). */
export interface NewUserProps {
  email: Email;
  passwordHash: string;
  role: Role;
}

/**
 * `User` aggregate root (BC-7 Identity & Access). Holds identity, an opaque
 * `passwordHash`, and a `Role`. The domain NEVER hashes or compares passwords —
 * hashing is a `PasswordHasherPort` concern in infra; the aggregate only ever
 * receives an already-computed hash string.
 *
 * KEN'S FILL FILE — implement the bodies. Keep the signatures: the handlers and
 * the mapper compile against them. Your spec is `user.model.spec.ts`.
 */
export class User {
  private constructor(
    private readonly _id: string,
    private readonly _email: Email,
    private readonly _passwordHash: string,
    private readonly _role: Role,
    private readonly _createdAt: Date,
  ) {}

  /**
   * Register a new user. Generate a fresh uuid id (Node's `crypto.randomUUID()`
   * is allowed here — it is a runtime primitive, not a framework import) and
   * stamp `createdAt = new Date()`. The `passwordHash` is passed in opaque.
   */
  static create(props: NewUserProps): User {
    if (!props.passwordHash) {
      throw new Error('Password hash is required');
    }
    const id = randomUUID();
    const createdAt = new Date();
    return new User(id, props.email, props.passwordHash, props.role, createdAt);
  }

  /** Restore a `User` from a persisted snapshot (no id generation). */
  static reconstitute(snapshot: UserSnapshot): User {
    return new User(
      snapshot.id,
      snapshot.email,
      snapshot.passwordHash,
      snapshot.role,
      snapshot.createdAt,
    );
  }

  get id(): string {
    return this._id;
  }

  get email(): Email {
    return this._email;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get role(): Role {
    return this._role;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }
}
