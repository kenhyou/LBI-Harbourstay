import { PaymentId } from './payment-id.vo';

/**
 * KEN'S EXECUTABLE SPEC for the `PaymentId` VO. Pure unit — ZERO mocks. RED until
 * you implement `payment-id.vo.ts`.
 */
describe('PaymentId (VO)', () => {
  it('generates a non-empty string id', () => {
    const id = PaymentId.generate();
    expect(typeof id.value).toBe('string');
    expect(id.value.length).toBeGreaterThan(0);
  });

  it('generates distinct ids', () => {
    expect(PaymentId.generate().value).not.toBe(PaymentId.generate().value);
  });

  it('wraps an existing id string via create()', () => {
    const id = PaymentId.create('11111111-1111-1111-1111-111111111111');
    expect(id.value).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects an empty id', () => {
    expect(() => PaymentId.create('')).toThrow();
  });

  it('compares by value', () => {
    const a = PaymentId.create('same-id');
    const b = PaymentId.create('same-id');
    const c = PaymentId.create('other-id');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
