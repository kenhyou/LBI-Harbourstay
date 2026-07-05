import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { UserRepository } from './user.repository';
import { User } from '@/identity/domain/models/user.model';
import { Email } from '@/identity/domain/vo/email.vo';
import { Role } from '@/identity/domain/enums/role.enum';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Write-repository round-trip against a REAL Postgres (Testcontainers). Exercises
 * the mapper (domain↔row) and thus Ken's `User`/`Email` fill: RED until the
 * domain is implemented, green afterwards. Requires Docker.
 */
jest.setTimeout(180_000);

describe('UserRepository (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: UserRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    const apiRoot = join(__dirname, '..', '..', '..', '..');
    execFileSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
    );

    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
    repo = new UserRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('saves a new user and finds it by email (round-trip through the mapper)', async () => {
    const user = User.create({
      email: Email.create('Round@Trip.com'),
      passwordHash: 'digest-1',
      role: Role.Host,
    });
    await repo.save(user);

    const found = await repo.findByEmail('round@trip.com');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
    expect(found!.email.value).toBe('round@trip.com');
    expect(found!.passwordHash).toBe('digest-1');
    expect(found!.role).toBe(Role.Host);
  });

  it('finds the same user by id', async () => {
    const user = User.create({
      email: Email.create('byid@example.com'),
      passwordHash: 'digest-2',
      role: Role.Guest,
    });
    await repo.save(user);

    const found = await repo.findById(user.id);
    expect(found?.email.value).toBe('byid@example.com');
  });

  it('returns null for an unknown email', async () => {
    expect(await repo.findByEmail('ghost@example.com')).toBeNull();
  });

  it('persists the row with the email UNIQUE constraint (duplicate rejected)', async () => {
    const first = User.create({
      email: Email.create('dupe@example.com'),
      passwordHash: 'd',
      role: Role.Guest,
    });
    await repo.save(first);

    // A different aggregate id but the same email must violate the DB unique index.
    await expect(
      prisma.user.create({
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'dupe@example.com',
          passwordHash: 'd',
          role: 'guest',
        },
      }),
    ).rejects.toThrow();
  });
});
