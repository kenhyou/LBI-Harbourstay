import { BcryptPasswordHasher } from './bcrypt-password-hasher';

/**
 * Real-bcrypt spec for the hasher adapter (no mocks — bcrypt is deterministic
 * enough to assert compare semantics). Green now.
 */
describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('produces a salted hash that is not the plaintext', async () => {
    const hash = await hasher.hash('super-secret');
    expect(hash).not.toBe('super-secret');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  it('compare returns true for the matching plaintext', async () => {
    const hash = await hasher.hash('super-secret');
    expect(await hasher.compare('super-secret', hash)).toBe(true);
  });

  it('compare returns false for a wrong plaintext', async () => {
    const hash = await hasher.hash('super-secret');
    expect(await hasher.compare('not-it', hash)).toBe(false);
  });

  it('salts: two hashes of the same input differ', async () => {
    const a = await hasher.hash('same');
    const b = await hasher.hash('same');
    expect(a).not.toBe(b);
  });
});
