/**
 * `LoginUser` command (BC-7). Carries the already-validated login body.
 */
export class LoginUserCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
