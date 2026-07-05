import type { RegisterRequest } from '@harbourstay/shared';

/**
 * `RegisterUser` command (BC-7). Carries the already-validated register body.
 * `role` is `'guest' | 'host'` (admin is never self-registerable).
 */
export class RegisterUserCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly role: RegisterRequest['role'],
  ) {}
}
