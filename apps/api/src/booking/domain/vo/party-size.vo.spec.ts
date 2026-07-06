import { PartySize } from './party-size.vo';

/**
 * KEN'S EXECUTABLE SPEC for the `PartySize` VO. Pure unit — ZERO mocks. RED until
 * you implement `party-size.vo.ts`.
 */
describe('PartySize (booking VO)', () => {
  it('accepts a positive integer count', () => {
    expect(PartySize.create(2).value).toBe(2);
    expect(PartySize.create(1).value).toBe(1);
  });

  it('rejects zero', () => {
    expect(() => PartySize.create(0)).toThrow();
  });

  it('rejects negative counts', () => {
    expect(() => PartySize.create(-3)).toThrow();
  });

  it('rejects a non-integer count', () => {
    expect(() => PartySize.create(2.5)).toThrow();
  });

  it('compares by value', () => {
    expect(PartySize.create(3).equals(PartySize.create(3))).toBe(true);
    expect(PartySize.create(3).equals(PartySize.create(4))).toBe(false);
  });
});
