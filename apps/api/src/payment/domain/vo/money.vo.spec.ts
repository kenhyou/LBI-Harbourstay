import { Money } from './money.vo';

/**
 * KEN'S EXECUTABLE SPEC for the Payment `Money` VO. Pure unit — ZERO mocks. RED
 * until you implement `money.vo.ts`. Amount is integer minor units (cents), ≥ 0.
 */
describe('Money (payment VO)', () => {
  it('creates from integer minor units', () => {
    const m = Money.create(33_000, 'USD');
    expect(m.amount).toBe(33_000);
    expect(m.currency).toBe('USD');
  });

  it('defaults currency to USD', () => {
    expect(Money.create(500).currency).toBe('USD');
  });

  it('allows zero', () => {
    expect(Money.create(0).amount).toBe(0);
  });

  it('rejects negative amounts', () => {
    expect(() => Money.create(-1)).toThrow();
  });

  it('rejects non-integer amounts (no fractional cents)', () => {
    expect(() => Money.create(10.5)).toThrow();
  });

  it('rejects empty currency', () => {
    expect(() => Money.create(100, '')).toThrow();
  });

  it('reconstitutes a trusted stored amount without re-validation', () => {
    const m = Money.reconstitute(12_345, 'USD');
    expect(m.amount).toBe(12_345);
    expect(m.currency).toBe('USD');
  });

  it('compares by value (amount AND currency)', () => {
    expect(Money.create(100, 'USD').equals(Money.create(100, 'USD'))).toBe(true);
    expect(Money.create(100, 'USD').equals(Money.create(200, 'USD'))).toBe(false);
    expect(Money.create(100, 'USD').equals(Money.create(100, 'EUR'))).toBe(false);
  });
});
