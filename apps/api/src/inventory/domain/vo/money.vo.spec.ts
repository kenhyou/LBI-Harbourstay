import { Money } from './money.vo';

/** BC-2 `Money` VO spec (scaffold-owned, GREEN now). */
describe('Money (inventory VO)', () => {
  it('creates from integer minor units', () => {
    const m = Money.create(10_000, 'USD');
    expect(m.amount).toBe(10_000);
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

  it('multiplies by an integer factor (nights)', () => {
    expect(Money.create(10_000).times(3).amount).toBe(30_000);
  });

  it('adds same-currency money', () => {
    expect(Money.create(30_000).add(Money.create(3_000)).amount).toBe(33_000);
  });

  it('rejects adding a different currency', () => {
    expect(() => Money.create(100, 'USD').add(Money.create(100, 'EUR'))).toThrow();
  });

  it('compares by value', () => {
    expect(Money.create(100, 'USD').equals(Money.create(100, 'USD'))).toBe(true);
    expect(Money.create(100, 'USD').equals(Money.create(200, 'USD'))).toBe(false);
  });
});
