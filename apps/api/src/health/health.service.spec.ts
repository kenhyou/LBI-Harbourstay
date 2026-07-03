import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns an ok status that satisfies the shared contract', () => {
    const result = new HealthService().check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('harbourstay-api');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
