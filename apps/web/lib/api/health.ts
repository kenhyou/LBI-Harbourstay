import { healthResponse, type HealthResponse } from '@harbourstay/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Server-side typed client for GET /health. The response is runtime-validated
 * against the same Zod schema the API validates its output with — so a contract
 * drift surfaces here at the parse boundary, not as a silent wrong render.
 */
export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`API /health responded ${res.status}`);
  }
  return healthResponse.parse(await res.json());
}
