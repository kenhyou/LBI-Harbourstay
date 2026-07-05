import { User } from './user.model';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';

/**
 * Executable spec for the `User` aggregate (Ken's fill file). Pure unit — ZERO
 * mocks. The domain NEVER hashes: `passwordHash` is an opaque string in/out.
 * RED until `user.model.ts` (and the `Email` VO it depends on) is implemented.
 */
describe('User (aggregate root)', () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  describe('create (register a new user)', () => {
    it('builds a user from the given email VO, hash, and role', () => {
      const email = Email.create('new@example.com');
      const user = User.create({
        email,
        passwordHash: 'hashed-secret',
        role: Role.Host,
      });

      expect(user.email.equals(email)).toBe(true);
      expect(user.passwordHash).toBe('hashed-secret');
      expect(user.role).toBe(Role.Host);
    });

    it('throw error if password hash is empty', () => {
      expect(() => {
        User.create({
          email: Email.create('a@example.com'),
          passwordHash: '',
          role: Role.Guest,
        });
      }).toThrow();
    });

    it('generates a fresh uuid id', () => {
      const user = User.create({
        email: Email.create('a@example.com'),
        passwordHash: 'h',
        role: Role.Guest,
      });
      expect(user.id).toMatch(UUID_RE);
    });

    it('gives two newly-created users distinct ids', () => {
      const a = User.create({
        email: Email.create('a@example.com'),
        passwordHash: 'h',
        role: Role.Guest,
      });
      const b = User.create({
        email: Email.create('b@example.com'),
        passwordHash: 'h',
        role: Role.Guest,
      });
      expect(a.id).not.toBe(b.id);
    });

    it('stamps createdAt with a Date', () => {
      const user = User.create({
        email: Email.create('a@example.com'),
        passwordHash: 'h',
        role: Role.Guest,
      });
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('stores the passwordHash opaquely (never mutates/hashes it)', () => {
      const opaque = '$2b$10$abcdefghijklmnopqrstuv';
      const user = User.create({
        email: Email.create('a@example.com'),
        passwordHash: opaque,
        role: Role.Guest,
      });
      expect(user.passwordHash).toBe(opaque);
    });
  });

  describe('reconstitute (restore from persistence)', () => {
    it('round-trips every field from a snapshot', () => {
      const id = '11111111-1111-4111-8111-111111111111';
      const email = Email.reconstitute('stored@example.com');
      const createdAt = new Date('2026-01-01T00:00:00.000Z');

      const user = User.reconstitute({
        id,
        email,
        passwordHash: 'stored-hash',
        role: Role.Admin,
        createdAt,
      });

      expect(user.id).toBe(id);
      expect(user.email.value).toBe('stored@example.com');
      expect(user.passwordHash).toBe('stored-hash');
      expect(user.role).toBe(Role.Admin);
      expect(user.createdAt).toStrictEqual(createdAt);
    });
  });
});
