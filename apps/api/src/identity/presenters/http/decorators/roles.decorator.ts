import { SetMetadata } from '@nestjs/common';
import type { Role } from '@harbourstay/shared';

/** Metadata key under which `@Roles()` stores the allowed roles. */
export const ROLES_KEY = 'roles';

/**
 * Restrict a route (or controller) to the given roles. Enforced by `RolesGuard`,
 * which reads this metadata. With no `@Roles()`, a route is open to any
 * authenticated user (the `JwtCookieGuard` still runs).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
