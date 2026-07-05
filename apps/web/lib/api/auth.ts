import {
  authUser,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@harbourstay/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** 401 from /auth/login — bad email/password. Surfaced to the user as-is. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

/** 409 from /auth/register — the email already has an account. */
export class EmailInUseError extends Error {
  constructor() {
    super('That email is already registered');
    this.name = 'EmailInUseError';
  }
}

/** Any other non-OK auth response — an infrastructure/contract fault. */
export class AuthApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthApiError';
  }
}

/**
 * The parsed safe user plus the raw Set-Cookie header(s) the API returned, so
 * the route handler can relay the httpOnly JWT cookie(s) onto the web origin.
 */
export interface AuthResult {
  user: AuthUser;
  setCookies: string[];
}

async function postAuth(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

/**
 * Server-side typed client for POST /auth/login. Response is runtime-validated
 * against the shared `authUser` schema; 401 maps to InvalidCredentialsError so
 * the route handler can return a clean 401 to the browser.
 */
export async function loginToApi(body: LoginRequest): Promise<AuthResult> {
  const res = await postAuth('/auth/login', body);
  if (res.status === 401) throw new InvalidCredentialsError();
  if (!res.ok) {
    throw new AuthApiError(`POST /auth/login responded ${res.status}`);
  }
  const user = authUser.parse(await res.json());
  return { user, setCookies: res.headers.getSetCookie() };
}

/**
 * Server-side typed client for POST /auth/register. 409 maps to EmailInUseError.
 */
export async function registerToApi(body: RegisterRequest): Promise<AuthResult> {
  const res = await postAuth('/auth/register', body);
  if (res.status === 409) throw new EmailInUseError();
  if (!res.ok) {
    throw new AuthApiError(`POST /auth/register responded ${res.status}`);
  }
  const user = authUser.parse(await res.json());
  return { user, setCookies: res.headers.getSetCookie() };
}
