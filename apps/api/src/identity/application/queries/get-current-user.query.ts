/**
 * `GetCurrentUser` query (BC-7). Given an authenticated user id (from the
 * verified access token), returns the SAFE `AuthUser` read model. Backs
 * `GET /auth/me`.
 */
export class GetCurrentUserQuery {
  constructor(public readonly userId: string) {}
}
