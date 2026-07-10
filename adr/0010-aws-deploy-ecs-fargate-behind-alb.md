# ADR-0010: Deploy the API on ECS Fargate behind an ALB (not Lambda or App Runner)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Slice:** Deploy (the S4 cut line)
- **Deciders:** Ken (with Claude Code)

## Context

S4 is the minimum deployable cut line (PRD §12): search → reserve → pay-test → confirm.
The stack is a NestJS API, a Next.js App Router frontend, and Postgres. The target is
AWS, driven from the console (this is a learning build), on a fresh account with a
modest budget.

Two properties of the code we already wrote constrain the topology far more than any
preference does:

1. **The API needs an always-on process with unthrottled CPU.** S4 runs two
   `@Interval` background timers inside the Nest process: the Transactional Outbox
   relay (5s, ADR-0009) and the hold-expiry compensation job (60s). Nothing external
   invokes them.
2. **The API needs outbound internet.** The Stripe ACL (ADR-0008) calls
   `api.stripe.com` to create PaymentIntents.

A third property removes a constraint that would otherwise apply: **the browser never
calls the API directly.** `API_URL` is a server-only env var; Next.js route handlers
proxy every call and relay the API's `Set-Cookie` onto the web origin. So the httpOnly
JWT cookie (ADR-0006) stays host-only and `SameSite=lax` even though web and api sit on
different hostnames — no `SameSite=None`, no CORS credentials dance, no code change.

## Decision

**Frontend** → **AWS Amplify Hosting** (`app.harbourstay.xyz`), managed Next.js SSR/RSC,
git-push deploys, Amplify-managed certificate.

**API** → **ECS on Fargate**, one task, behind an **Application Load Balancer**
(`api.harbourstay.xyz`) terminating TLS with an **ACM** certificate in the ALB's own region.

**Database** → **RDS for PostgreSQL 16**, `db.t4g.micro`, single-AZ, **not publicly
accessible**, reachable only from the task's security group.

**Config** → **SSM Parameter Store** `SecureString` (free), read by the task execution
role. Not Secrets Manager (~$0.40/secret/month for no benefit at this scale).

Two specifics that carry the design:

- **The Fargate task runs in a *public* subnet with `assignPublicIp: ENABLED`.** It
  reaches `api.stripe.com` through the VPC's existing Internet Gateway. It is *not*
  publicly reachable: `harbourstay-api-sg` only accepts port 8080 from
  `harbourstay-alb-sg`. Security groups chain ALB → task → RDS.
- **Migrations run in the container**, not from a workstation: the image ships the
  Prisma CLI as a runtime dependency and its `CMD` runs `prisma migrate deploy` before
  `node dist/main.js`. `migrate deploy` is idempotent and takes a Postgres advisory
  lock, so it is safe on every restart and with more than one task. This is why RDS
  never has to be publicly accessible.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| **ECS Fargate + ALB** (chosen) | real always-on container, full CPU; the standard industry shape; no servers to patch | ALB ~$18/mo; the most console steps; needs an owned domain for ACM | the only shape that satisfies both constraints at a defensible cost |
| AWS Lambda | scales to zero; cheapest idle | **no background timers** — the outbox relay would never run between requests; 15-min cap | silently breaks S4's event delivery |
| AWS App Runner | far fewer console steps; free managed HTTPS on `*.awsapprunner.com` | **throttles CPU when idle**, so `@Interval` timers fire erratically or not at all; a VPC connector (needed for private RDS) routes *all* egress through the VPC, so Stripe calls then require a **NAT Gateway ~$32/mo** | the same failure mode as Lambda, plus a cost trap |
| Fargate in a **private** subnet | textbook-correct isolation | outbound to Stripe requires a **NAT Gateway (~$32/mo)** — larger than every other line item combined | the public-subnet + SG-restricted task gives equivalent protection here for $0 |
| EC2 + Docker + Caddy | ~free on the year-1 tier; full control | you patch, restart, and babysit the box; TLS via Let's Encrypt, not ACM | teaches Linux ops rather than cloud architecture; less defensible in review |
| Managed Postgres elsewhere (Neon/Supabase) | cheap, easy | splits the stack across providers; still must support `btree_gist` | keep the deploy inside one account/region |

## Consequences

- Positive: the S4 guarantees survive deployment intact — the outbox relay's `@Interval`
  really ticks, so `BookingConfirmed` is delivered; the Stripe ACL can reach Stripe; the
  `EXCLUDE`/`btree_gist` overbooking constraint (ADR-0007) works because RDS is real
  Postgres. The database is never exposed to the internet. Rollback is an ECS task-
  definition revision.
- Negative / trade-offs: ~$30/month in year one (~$45 after the RDS free tier), the ALB
  being the largest fixed cost; the most console surface of any option; an ACM cert (and
  therefore an owned domain) is mandatory because Stripe webhooks require HTTPS and ACM
  will not issue for `*.amazonaws.com`. Running the task in a public subnet is a
  deliberate cost trade that a security reviewer would question — the mitigation is the
  security-group chain, and the note in `docs/DEPLOY.md`.
- Follow-ups: infrastructure is click-ops for now; codifying it (CDK or Terraform) is
  the natural hardening step in S7, along with autoscaling >1 task, RDS Multi-AZ, and a
  real mailer (SES) behind the existing `MailerPort`. `docs/DEPLOY.md` is the runbook.
