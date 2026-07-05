import { Email } from './email.vo';

/**
 * Executable spec for the `Email` VO (Ken's fill file). Pure unit — ZERO mocks.
 * RED until `email.vo.ts` is implemented; do not weaken these to pass a stub.
 */
describe('Email (value object)', () => {
  describe('create', () => {
    it('accepts a valid address and exposes it via .value', () => {
      const email = Email.create('guest@harbourstay.com');
      expect(email.value).toBe('guest@harbourstay.com');
    });

    it('lowercases the address (case-insensitive identity)', () => {
      expect(Email.create('Ken@Example.COM').value).toBe('ken@example.com');
    });

    it('trims surrounding whitespace', () => {
      expect(Email.create('  ken@example.com  ').value).toBe('ken@example.com');
    });

    it('trims AND lowercases together', () => {
      expect(Email.create('  KEN@Example.Com \t').value).toBe('ken@example.com');
    });

    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['no @', 'notanemail'],
      ['no domain', 'ken@'],
      ['no local part', '@example.com'],
      ['no TLD', 'ken@example'],
      ['contains a space', 'ke n@example.com'],
      ['double @', 'ken@@example.com'],
    ])('rejects an invalid address (%s) by throwing', (_label, raw) => {
      expect(() => Email.create(raw)).toThrow();
    });
  });

  describe('reconstitute', () => {
    it('wraps a trusted stored value and returns it via .value', () => {
      expect(Email.reconstitute('stored@example.com').value).toBe(
        'stored@example.com',
      );
    });
  });

  describe('equals', () => {
    it('is true for two Emails with the same normalized value', () => {
      expect(
        Email.create('ken@example.com').equals(Email.create('KEN@Example.com')),
      ).toBe(true);
    });

    it('is false for Emails with different values', () => {
      expect(
        Email.create('a@example.com').equals(Email.create('b@example.com')),
      ).toBe(false);
    });
  });
});
