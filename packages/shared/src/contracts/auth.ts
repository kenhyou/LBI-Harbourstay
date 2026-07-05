import { z } from 'zod';

/**
 * Contracts for the S2 Authentication & Roles slice (BC-7 Identity & Access).
 * DTO/transport shapes only, not domain VOs — the API maps contract⇄domain at
 * the presenter boundary, validates inbound bodies against these schemas, and
 * the web app uses them for form validation (`zodResolver`) and to parse
 * responses. Tokens are NOT modelled here: the JWT lives in an httpOnly cookie
 * and is an infra concern, never a shared DTO.
 */

/**
 * Account role. Domain note (not encoded on the wire): this identity "guest"
 * is distinct from the Booking booker and from party-size guest counts.
 */
export const role = z.enum(['guest', 'host', 'admin']);

export type Role = z.infer<typeof role>;

/**
 * Body for `POST /auth/register`. `role` is self-service and can only ever be
 * `guest` or `host` — `admin` is never self-registerable, so the two-value
 * enum is inlined here rather than reusing `role`. Defaults to `guest`.
 */
export const registerRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['guest', 'host']).default('guest'),
});

export type RegisterRequest = z.infer<typeof registerRequest>;

/**
 * Body for `POST /auth/login`. On login we don't re-impose the registration
 * length rule — just require a non-empty password.
 */
export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequest>;

/**
 * The SAFE user shape returned to the client and stored in session context.
 * Never includes `passwordHash` or any secret.
 */
export const authUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role,
});

export type AuthUser = z.infer<typeof authUser>;
