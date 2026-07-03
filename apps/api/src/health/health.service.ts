import { Injectable } from '@nestjs/common';
import { healthResponse, type HealthResponse } from '@harbourstay/shared';

@Injectable()
export class HealthService {
  /**
   * Builds the health payload and validates it against the shared contract
   * before returning — so the API can never emit a shape the web app can't parse.
   */
  check(): HealthResponse {
    return healthResponse.parse({
      status: 'ok',
      service: 'harbourstay-api',
      timestamp: new Date().toISOString(),
    });
  }
}
