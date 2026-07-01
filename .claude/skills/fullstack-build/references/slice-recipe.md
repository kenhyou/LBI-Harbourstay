# The Vertical-Slice Recipe

Every slice (except P0) follows this exact rhythm. It is the repeatable procedure the skill runs; the code skeletons below are the shapes each agent produces. Adapt names to the slice's BC and Ubiquitous Language from STRATEGIC.md.

---

## Step 0 — Brief (skill, in the main thread)

- Read the slice row in `curriculum.md`, the BC in `docs/strategic-design/STRATEGIC.md`, and the Aggregates/use-cases in `docs/DESIGN.md`.
- State to the user: the slice goal, which BC(s), and the Definition of Done. Confirm before spawning agents.

---

## Step 1 — Contract first (`contract-designer` → `packages/shared`)

One Zod schema per request/response; infer the TS type; export both. This is the only place these types are defined.

```ts
// packages/shared/src/contracts/listing.ts
import { z } from 'zod';

export const listingSearchQuery = z.object({
  location: z.string().min(1),
  from: z.string().date(),
  to: z.string().date(),
  guests: z.coerce.number().int().positive(),
});
export type ListingSearchQuery = z.infer<typeof listingSearchQuery>;

export const listingSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  location: z.string(),
  basePrice: z.number(),
  thumbnailUrl: z.string().url().nullable(),
});
export type ListingSummary = z.infer<typeof listingSummary>;
```

Backend validates inbound with the schema; frontend uses it for form validation and typed responses. **No hand-written duplicate types on either end.**

---

## Step 2 — Backend (`backend-engineer` → `apps/api`)

Keep the hexagon. Order: domain → application (CQRS) → infra (Prisma) → presenters → module wiring. Write tests during each layer. Full layer/naming rules: `conventions.md`.

### Domain (pure — zero framework/ORM imports; `@Injectable` only on factories/domain services)

```ts
// apps/api/src/booking/domain/vo/date-range.vo.ts
export class DateRange {
  private constructor(
    public readonly checkIn: Date,
    public readonly checkOut: Date,
  ) {}

  static create(checkIn: Date, checkOut: Date): DateRange {
    if (checkIn >= checkOut) throw new InvalidDateRangeException();
    return new DateRange(checkIn, checkOut);
  }
  overlaps(other: DateRange): boolean {
    return this.checkIn < other.checkOut && other.checkIn < this.checkOut;
  }
  equals(other: DateRange): boolean {
    return this.checkIn.getTime() === other.checkIn.getTime()
      && this.checkOut.getTime() === other.checkOut.getTime();
  }
}
```

Aggregate roots own state transitions (guard → mutate → optionally record an event) and expose `create()` (new) + `reconstitute()` (from DB, no events). See conventions.md for method order.

### Application (CQRS — orchestration only, no business rules, no Prisma)

- Command + `@CommandHandler`: convert primitives → load/build aggregate → call domain method → save. Cross-aggregate writes go under one `@Transactional()` boundary via the transaction-manager port.
- Query + `@QueryHandler`: inject a **Query Port**, return a **Read Model DTO**. Never `reconstitute()` on the read path.
- Ports are `abstract class` (survive compilation, act as DI tokens).

```ts
// apps/api/src/booking/application/ports/booking.repository.port.ts
export abstract class BookingRepositoryPort {
  abstract save(booking: Booking): Promise<void>;
  abstract findById(id: BookingId): Promise<Booking | null>;
}
```

### Infra (Prisma lives here, behind the ports)

- `PrismaService` (Nest provider) wraps `PrismaClient`.
- Repository implements the port; a **mapper** converts Prisma row ↔ domain (`reconstitute` on read). Domain models never see Prisma types.
- Query Port impl projects Prisma rows **directly** into Read Model DTOs (no mapper, no reconstitute).
- Transactions: use `@nestjs-cls/transactional` with the Prisma adapter so `application/` calls a `TransactionHost`/`@Transactional()` and never touches `prisma.$transaction` directly. (Mirrors the TypeORM-transactional/CLS pattern.)
- Overbooking (S3): optimistic `version` column checked on write, or a Postgres `EXCLUDE`/unique constraint on `(listingId, dateRange)`. Whichever — record it in an ADR.

### Presenters (HTTP)

- Controller validates the request body against the shared Zod schema (a `ZodValidationPipe`), calls the thin service facade (which uses `CommandBus`/`QueryBus`), returns the Read Model (queries) or `{ id }`/`204` (commands). Swagger-annotate.

### Backend tests (during, not after)

- Domain: pure unit, **zero mocks**; positive + negative per state transition; VO semantics.
- Application: handler with Ports mocked (`jest.fn()`/fake), real factory/domain service.
- Infra: integration against **real Postgres via Testcontainers** — save/find round-trip; the S3 concurrency race test.
- `npx tsc --noEmit` is a separate gate from `pnpm test`.

---

## Step 3 — Frontend (`frontend-engineer` → `apps/web`)

Server-first (RSC); reach for client components only for interactivity. Uses the shared contract for both fetch types and form validation.

### Typed API client (shared contract in, typed data out)

```ts
// apps/web/lib/api/listings.ts
import { listingSummary, type ListingSearchQuery, type ListingSummary } from '@harbourstay/shared';

export async function searchListings(q: ListingSearchQuery): Promise<ListingSummary[]> {
  const res = await fetch(`${process.env.API_URL}/listings?` + new URLSearchParams(q as any), {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('search failed');
  return listingSummary.array().parse(await res.json()); // runtime-validate the contract
}
```

### Page as a Server Component; interactivity as a Client Component

```tsx
// apps/web/app/listings/page.tsx  (Server Component — fetches on the server)
import { searchListings } from '@/lib/api/listings';
import { SearchForm } from './search-form';

export default async function ListingsPage({ searchParams }: { searchParams: ListingSearchQuery }) {
  const listings = await searchListings(searchParams);
  return (
    <main>
      <SearchForm defaults={searchParams} />
      <ul>{listings.map((l) => <ListingCard key={l.id} listing={l} />)}</ul>
    </main>
  );
}
```

- Client components: forms (React Hook Form + `zodResolver` on the shared schema), anything using TanStack Query for client-side mutations/refetch (e.g. availability calendar, cancel).
- Add `loading.tsx` and `error.tsx` per route; explicit empty states; basic a11y (labels, focus).
- Auth (S2+): set/read the httpOnly cookie server-side (route handler or server action); guard protected routes server-side.

### Frontend tests

- Component tests for the interactive pieces where useful.
- Playwright for the slice's headline journey (search→detail; login; reserve; pay→confirm; cancel; host flow).

---

## Step 4 — Integrate & verify (`integration-verifier`)

- Start Postgres (docker-compose), run migrations + seed, start `apps/api` and `apps/web` (`pnpm dev`).
- Exercise the slice: curl every new endpoint (happy + error paths), then drive the UI (browser/Playwright) for the headline journey.
- Check **every** Definition-of-Done box for the slice. Report PASS/FAIL with evidence (status codes, screenshots/log lines). On FAIL, name the layer and hand back to the responsible engineer — the slice is not done.

---

## Step 5 — Record (skill, main thread)

- Update `docs/build/PROGRESS.md` (template in `templates/progress.md`): what shipped, DoD checklist, working/deployed state, next slice.
- If a non-obvious decision was made, add an ADR (`templates/adr.md`) under `adr/`.
- Stop. Summarize to the user and wait for confirmation before the next slice.

---

## Concurrency of agents

Contract-designer first (blocks both engineers). Once the contract is committed, backend-engineer and frontend-engineer run **in parallel** against it. Verifier runs only after both finish. Keep each agent's input scoped: slice brief + contract + relevant BC/Aggregate section + `conventions.md` — never the whole PRD.
