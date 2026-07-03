import { z } from 'zod';

/**
 * Contract for `GET /health`. The single source of truth both apps import:
 * the API validates its response against it; the web app parses the response
 * with it. A mismatch fails at compile time (types) or at the parse boundary.
 */
export const healthResponse = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponse>;
