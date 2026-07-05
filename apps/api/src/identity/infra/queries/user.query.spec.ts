import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { UserQuery } from './user.query';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Integration test for the BC-7 read projection against a REAL Postgres
 * (Testcontainers). Independent of Ken's domain fill (the read path never
 * touches a domain model), so this is GREEN once Docker is available. Proves
 * the SAFE projection: `passwordHash` never leaves the DB. Requires Docker.
 */
const USER_ID = '11111111-1111-4111-8111-111111111111';

jest.setTimeout(180_000);

describe('UserQuery (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let query: UserQuery;

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
    query = new UserQuery(prisma as unknown as PrismaService);

    await prisma.user.create({
      data: {
        id: USER_ID,
        email: 'me@example.com',
        passwordHash: '$2b$12$notarealhashbutlooksright000000000000000000',
        role: 'host',
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('projects the SAFE AuthUser shape (id, email, role) — no passwordHash', async () => {
    const result = await query.findAuthUserById(USER_ID);

    expect(result).toEqual({
      id: USER_ID,
      email: 'me@example.com',
      role: 'host',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns null for an unknown id', async () => {
    const result = await query.findAuthUserById(
      '99999999-9999-4999-8999-999999999999',
    );
    expect(result).toBeNull();
  });

  it('the read projection imports no domain models', () => {
    const src = require('node:fs').readFileSync(
      join(__dirname, 'user.query.ts'),
      'utf8',
    ) as string;
    expect(src).not.toMatch(/\/domain\//);
    expect(src).not.toMatch(/reconstitute/);
  });
});
