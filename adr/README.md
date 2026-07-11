# Architecture Decision Records

Each ADR captures one non-obvious decision: its context, the decision, the alternatives weighed, and the consequences. They were written **during the build**, at the slice that forced the choice — so the numbering roughly tracks the [build log](../docs/build/PROGRESS.md). All are **Accepted**.

> Format: context → decision → alternatives considered → consequences → (learning-build note). See any file for the shape; [ADR-0007](0007-overbooking-via-postgres-exclude-constraint.md) is a representative one.

| # | Decision | Slice |
|---|---|---|
| [0001](0001-monorepo-turborepo-pnpm.md) | Monorepo on Turborepo + pnpm | P0 |
| [0002](0002-prisma-behind-repository-port.md) | Prisma behind a repository port (keep the domain ORM-free) | P0 |
| [0003](0003-swc-builder-for-nest-path-aliases.md) | SWC builder for Nest path aliases | P0 |
| [0004](0004-shared-postgres-listing-table-ownership.md) | Shared Postgres; Listing table read-vs-write ownership | S1 |
| [0005](0005-money-minor-units-on-the-wire.md) | Money as integer minor units on the wire | S1 |
| [0006](0006-jwt-httponly-cookie-session-and-bcrypt.md) | JWT in an httpOnly cookie + bcrypt | S2 |
| [0007](0007-overbooking-via-postgres-exclude-constraint.md) | Overbooking prevented by a Postgres `EXCLUDE` constraint | S3 |
| [0008](0008-stripe-payment-gateway-anti-corruption-layer.md) | Stripe behind an Anti-Corruption Layer | S4 |
| [0009](0009-transactional-outbox-for-booking-confirmed.md) | Transactional Outbox for `BookingConfirmed` | S4 |
| [0010](0010-aws-deploy-ecs-fargate-behind-alb.md) | AWS deploy — ECS Fargate behind an ALB | Deploy |
| [0011](0011-cancellation-policy-vo-refund-computed-not-issued.md) | Cancellation policy VO; refund computed, not issued | S5 |
| [0012](0012-host-authorization-rbac-role-plus-ownership-404-no-leak.md) | Host authorization — RBAC 403 + ownership 404-no-leak | S6a |
| [0013](0013-availability-blocks-inside-listing-aggregate-enforced-at-hold-time.md) | Availability blocks inside the Listing aggregate, enforced at hold time | S6b |
| [0014](0014-owasp-security-baseline-and-secrets-fail-fast.md) | OWASP security baseline + secrets fail-fast | S7a |
| [0015](0015-observability-liveness-readiness-split-and-log-redaction.md) | Observability — liveness/readiness split + log redaction | S7b |

The PRD asked for **≥3** ADRs (§5 G5); the build produced **15** — the decision trail *is* one of the deliverables.
