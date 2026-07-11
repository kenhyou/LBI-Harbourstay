import { Capacity } from '@/inventory/domain/vo/capacity.vo';
import { InvalidListingDetailsException } from '@/inventory/domain/exceptions/invalid-listing-details.exception';

describe('Capacity (VO)', () => {
  it('accepts the minimum valid capacity of 1', () => {
    expect(Capacity.create(1).value).toBe(1);
  });

  it('accepts a larger positive integer', () => {
    expect(Capacity.create(12).value).toBe(12);
  });

  it('rejects zero', () => {
    expect(() => Capacity.create(0)).toThrow(InvalidListingDetailsException);
  });

  it('rejects a negative capacity', () => {
    expect(() => Capacity.create(-3)).toThrow(InvalidListingDetailsException);
  });

  it('rejects a non-integer capacity', () => {
    expect(() => Capacity.create(2.5)).toThrow(InvalidListingDetailsException);
  });

  it('compares by value (equal counts are equal)', () => {
    expect(Capacity.create(4).equals(Capacity.create(4))).toBe(true);
    expect(Capacity.create(4).equals(Capacity.create(5))).toBe(false);
  });
});
