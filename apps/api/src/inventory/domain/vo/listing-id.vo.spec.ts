import { ListingId } from '@/inventory/domain/vo/listing-id.vo';

describe('ListingId (VO)', () => {
  it('generates a fresh, unique identity each time', () => {
    const a = ListingId.generate();
    const b = ListingId.generate();
    expect(a.value).toEqual(expect.any(String));
    expect(a.value).not.toBe(b.value);
  });

  it('rebuilds from a trusted string and exposes it', () => {
    const id = ListingId.fromString('11111111-1111-4111-8111-111111111111');
    expect(id.value).toBe('11111111-1111-4111-8111-111111111111');
    expect(id.toString()).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects an empty string', () => {
    expect(() => ListingId.fromString('')).toThrow();
    expect(() => ListingId.fromString('   ')).toThrow();
  });

  it('compares by value', () => {
    const raw = '22222222-2222-4222-8222-222222222222';
    expect(ListingId.fromString(raw).equals(ListingId.fromString(raw))).toBe(true);
    expect(ListingId.generate().equals(ListingId.generate())).toBe(false);
  });
});
