import { PricingService } from './pricing.service';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { Money } from '@/inventory/domain/vo/money.vo';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * BC-2 `PricingService` spec (scaffold-owned, GREEN now). Real, deterministic
 * calc: total = basePrice × nights + 10% service fee (rounded).
 */
describe('PricingService', () => {
  const pricing = new PricingService();

  it('quotes base rate × nights plus the 10% service fee', () => {
    // 10000 cents/night × 3 nights = 30000; fee = round(30000 × 0.10) = 3000.
    const quote = pricing.quote(
      { basePrice: Money.create(10_000, 'USD') },
      DateRange.create(d('2026-07-01'), d('2026-07-04')),
    );
    expect(quote.amount).toBe(33_000);
    expect(quote.currency).toBe('USD');
  });

  it('scales with the number of nights', () => {
    const quote = pricing.quote(
      { basePrice: Money.create(5_000, 'USD') },
      DateRange.create(d('2026-07-01'), d('2026-07-02')),
    );
    // 5000 × 1 = 5000; fee = 500 → 5500.
    expect(quote.amount).toBe(5_500);
  });

  it('rounds the service fee to whole minor units', () => {
    const quote = pricing.quote(
      { basePrice: Money.create(3_333, 'USD') },
      DateRange.create(d('2026-07-01'), d('2026-07-02')),
    );
    // subtotal 3333; fee = round(333.3) = 333 → 3666.
    expect(quote.amount).toBe(3_666);
  });

  it('preserves the base price currency', () => {
    const quote = pricing.quote(
      { basePrice: Money.create(10_000, 'EUR') },
      DateRange.create(d('2026-07-01'), d('2026-07-03')),
    );
    expect(quote.currency).toBe('EUR');
  });
});
