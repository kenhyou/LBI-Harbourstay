# Harbourstay — AWS Deployment Runbook

Deploys the **S4 cut line** (search → reserve → pay-test → confirm) to AWS.
Console-driven, with CLI where the console cannot help (building images).

> **Stripe stays in TEST MODE.** No real money moves (PRD §2 N4). Never put a
> live `sk_live_…` key anywhere in this runbook.

---

## 0. The facts for this account

| Thing | Value |
|---|---|
| AWS account | `935140614126` |
| IAM user | `ken` (MFA on) · CLI profile `harbourstay` |
| Region | `us-west-2` (Oregon) — **everything** lives here |
| VPC | `vpc-0f18bafafd74fe34a` (default, `172.31.0.0/16`) |
| Internet Gateway | `igw-0cc4c3ad58c579249` |
| Public subnets | `subnet-04cf913a59dfab67a` (2a) · `subnet-0803dcc06b1ae2ca0` (2b) · `subnet-0de8444e83c8cf116` (2c) · `subnet-02053d6ca115cfca1` (2d) |
| ACM certificate | `arn:aws:acm:us-west-2:935140614126:certificate/30f1bd9b-ffa9-4955-9b0e-4aab3206071b` (`api.hoegun.xyz`, ISSUED) |
| API hostname | `api.hoegun.xyz` → ALB |
| Web hostname | `app.hoegun.xyz` → Amplify |
| DNS | GoDaddy (nameservers `ns37/ns38.domaincontrol.com`) |

> ⚠️ The apex `hoegun.xyz` already resolves to `35.185.44.232` (something of
> yours on Google Cloud). **We add only `api.` and `app.` records.** Do not
> repoint the apex or the nameservers.

Every CLI command below assumes:

```bash
export AWS_PROFILE=harbourstay
export AWS_REGION=us-west-2
```

---

## The topology, and why

```
                    ┌──────────────┐
  browser ─https──▶ │   Amplify    │  app.hoegun.xyz   (Next.js SSR/RSC)
                    └──────┬───────┘
                           │ server-side fetch (API_URL)
                           ▼
                    ┌──────────────┐
  Stripe ─webhook─▶ │     ALB      │  api.hoegun.xyz   (TLS terminates here, ACM)
                    └──────┬───────┘
                           │ http :8080
                           ▼
                    ┌──────────────┐
                    │ ECS Fargate  │  public subnet + public IP
                    │  (1 task)    │  ──── egress via IGW ───▶ api.stripe.com
                    └──────┬───────┘
                           │ :5432
                           ▼
                    ┌──────────────┐
                    │ RDS Postgres │  private (not publicly accessible)
                    └──────────────┘
```

Three decisions worth understanding (see **ADR-0010**):

1. **Fargate, not Lambda or App Runner.** The API runs two `@Interval` background
   timers (the S4 outbox relay, and hold-expiry). Lambda has no background timers;
   App Runner **throttles CPU when idle**, so those timers would fire erratically or
   not at all, and `BookingConfirmed` emails would silently stall. Fargate gives a
   real always-on container with unthrottled CPU.
2. **Task in a *public* subnet with a public IP.** The API must call `api.stripe.com`
   outbound. A task in a private subnet needs a **NAT Gateway (~$32/mo)** to do that.
   A public subnet + IGW gives the same egress for **$0**. The task is still not
   reachable from the internet — its security group only accepts traffic from the ALB.
3. **The browser never calls the API directly.** `API_URL` is server-only; the Next.js
   route handlers proxy and relay the `Set-Cookie` onto the web origin. So the auth
   cookie stays `SameSite=lax` host-only and **no CORS/cookie code changes are needed**.

---

## 1. Push the image to ECR

The console cannot build container images. This step is CLI.

**Create the repository** (Console → ECR → Create repository → Private → name
`harbourstay-api`), or:

```bash
aws ecr create-repository --repository-name harbourstay-api \
  --image-scanning-configuration scanOnPush=true
```

**Build and push.** Your Mac is `arm64`; **Fargate here is `x86_64`**. You *must*
cross-build, or the task fails to start with an error that never mentions architecture.

```bash
cd /Users/ken/Projects/Ken/LBI-Harbourstay
ACCOUNT=935140614126
ECR=$ACCOUNT.dkr.ecr.us-west-2.amazonaws.com
TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password | docker login --username AWS --password-stdin $ECR

docker buildx build --platform linux/amd64 \
  -f apps/api/Dockerfile \
  -t $ECR/harbourstay-api:$TAG \
  -t $ECR/harbourstay-api:latest \
  --push .
```

- [ ] `aws ecr list-images --repository-name harbourstay-api` shows the tag.

---

## 2. Store configuration in SSM Parameter Store

**SecureString parameters are free**; Secrets Manager would be ~$0.40/secret/month.
ECS reads either one identically.

Generate strong JWT secrets locally and store them. **Do not paste secrets into chat
or commit them.**

```bash
put() { aws ssm put-parameter --name "$1" --value "$2" --type SecureString --overwrite; }

put /harbourstay/JWT_ACCESS_SECRET   "$(openssl rand -base64 48)"
put /harbourstay/JWT_REFRESH_SECRET  "$(openssl rand -base64 48)"
put /harbourstay/STRIPE_SECRET_KEY   "sk_test_…"     # from your Stripe dashboard
put /harbourstay/STRIPE_WEBHOOK_SECRET "whsec_placeholder"   # real value in step 9
put /harbourstay/DATABASE_URL        "postgresql://placeholder"  # real value in step 3
```

`STRIPE_WEBHOOK_SECRET` and `DATABASE_URL` are placeholders for now — you cannot know
them until RDS and the Stripe endpoint exist. We overwrite them later.

- [ ] `aws ssm get-parameters-by-path --path /harbourstay --query 'Parameters[].Name'` lists 5.

---

## 3. Security groups (create these *before* RDS and the ALB)

Console → **VPC → Security groups → Create**. Three groups, chained so that each tier
only accepts traffic from the tier in front of it.

| Name | Inbound | Source |
|---|---|---|
| `harbourstay-alb-sg` | TCP 443, TCP 80 | `0.0.0.0/0` (the public internet) |
| `harbourstay-api-sg` | TCP 8080 | **`harbourstay-alb-sg`** (not an IP range) |
| `harbourstay-rds-sg` | TCP 5432 | **`harbourstay-api-sg`** |

All in `vpc-0f18bafafd74fe34a`. Leave outbound as the default "all traffic" —
the API needs egress to Stripe.

> Sourcing a rule from *another security group* rather than a CIDR is the point.
> It means "whatever IP the ALB happens to have," which for an autoscaling ALB is
> the only sane way to express it.

- [ ] Three SGs exist, each referencing the previous one.

---

## 4. RDS PostgreSQL

Console → **RDS → Create database**.

| Field | Value |
|---|---|
| Method | Standard create |
| Engine | **PostgreSQL 16.14** (matches local `postgres:16`) |
| Template | **Free tier** |
| DB instance identifier | `harbourstay-db` |
| Master username | `harbourstay` |
| Master password | generate a strong one — **save it** |
| Instance class | `db.t4g.micro` |
| Storage | 20 GiB gp3 · **disable** storage autoscaling |
| VPC | `vpc-0f18bafafd74fe34a` |
| **Public access** | **No** |
| Security group | `harbourstay-rds-sg` (remove `default`) |
| Initial database name | `harbourstay` (under *Additional configuration* — **easy to miss**) |
| Backups | 7 days (or 0 to save a little) |

Takes ~10 minutes. When the endpoint appears, write the real connection string:

```bash
ENDPOINT=harbourstay-db.xxxxxxxx.us-west-2.rds.amazonaws.com
aws ssm put-parameter --name /harbourstay/DATABASE_URL --type SecureString --overwrite \
  --value "postgresql://harbourstay:<PASSWORD>@$ENDPOINT:5432/harbourstay?schema=public&sslmode=require"
```

> `sslmode=require` is not optional — RDS Postgres ≥15 sets `rds.force_ssl=1`, and
> Prisma will fail to connect without it.

**`btree_gist`**: your S3 overbooking `EXCLUDE` constraint needs it. It ships with RDS
Postgres and the migration runs `CREATE EXTENSION IF NOT EXISTS btree_gist;` itself —
the master user has rights to do that. Nothing to do here, but that's *why* RDS and not
some Postgres-compatible substitute.

- [ ] Status `Available`, **Publicly accessible = No**, SG = `harbourstay-rds-sg`.

---

## 5. Target group + Application Load Balancer

**Target group** — Console → EC2 → Target groups → Create:

| Field | Value |
|---|---|
| Target type | **IP addresses** (required for Fargate `awsvpc`) |
| Name | `harbourstay-api-tg` |
| Protocol / port | HTTP · **8080** |
| VPC | `vpc-0f18bafafd74fe34a` |
| Health check path | **`/health`** |
| Healthy threshold | 2 · Interval 15s |

Do **not** register any targets by hand — ECS registers the task for you.

**Load balancer** — Console → EC2 → Load balancers → Create → **Application**:

| Field | Value |
|---|---|
| Name | `harbourstay-alb` · **Internet-facing** · IPv4 |
| VPC / subnets | the VPC, and **at least two** public subnets (2a + 2b) |
| Security group | `harbourstay-alb-sg` |
| Listener **HTTPS :443** | forward → `harbourstay-api-tg`, certificate = the ACM cert above |
| Listener **HTTP :80** | **Redirect** to HTTPS :443 (301) |

- [ ] ALB state `active`; note its DNS name (`harbourstay-alb-….us-west-2.elb.amazonaws.com`).

---

## 6. IAM role for the task

ECS needs permission to pull the image, write logs, **and read your SSM parameters**.

Console → IAM → Roles → Create role → **AWS service → Elastic Container Service Task**:

- Attach **`AmazonECSTaskExecutionRolePolicy`**
- Name it `ecsTaskExecutionRole`
- Then **add an inline policy** — without this, tasks fail to start with
  `ResourceInitializationError: unable to pull secrets`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:GetParameters", "kms:Decrypt"],
    "Resource": [
      "arn:aws:ssm:us-west-2:935140614126:parameter/harbourstay/*",
      "arn:aws:kms:us-west-2:935140614126:alias/aws/ssm"
    ]
  }]
}
```

---

## 7. ECS cluster, task definition, service

**Cluster** — Console → ECS → Create cluster → name `harbourstay` → **AWS Fargate**.

**Task definition** — Create new, *Fargate*:

| Field | Value |
|---|---|
| Family | `harbourstay-api` |
| CPU / Memory | **0.25 vCPU / 1 GB** |
| Task execution role | `ecsTaskExecutionRole` |
| Container name | `api` |
| Image URI | `935140614126.dkr.ecr.us-west-2.amazonaws.com/harbourstay-api:latest` |
| Port mapping | **8080** TCP |
| Log driver | `awslogs` (Console offers to create the log group) |

**Environment variables** (plain):

| Key | Value |
|---|---|
| `WEB_ORIGIN` | `https://app.hoegun.xyz` |

`PORT=8080` and `NODE_ENV=production` are already baked into the image.

**Secrets** (`ValueFrom` → SSM parameter ARN), one row each:

`DATABASE_URL` · `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET`

ARN form: `arn:aws:ssm:us-west-2:935140614126:parameter/harbourstay/DATABASE_URL`

**Service** — from the cluster → Create service:

| Field | Value |
|---|---|
| Launch type | Fargate · Task definition `harbourstay-api:latest` |
| Service name | `harbourstay-api` · Desired tasks **1** |
| VPC / subnets | the VPC, public subnets 2a + 2b |
| Security group | `harbourstay-api-sg` |
| **Public IP** | **ENABLED** ← without this there is no route to Stripe |
| Load balancer | ALB `harbourstay-alb` → target group `harbourstay-api-tg` → container `api:8080` |
| Health check grace period | **120s** (the container runs `prisma migrate deploy` before listening) |

The container's `CMD` runs `prisma migrate deploy` on every start. It's idempotent and
takes a Postgres advisory lock, so it's safe on restart and with >1 task.

- [ ] Service reaches 1/1 running; target group shows the task **healthy**.
- [ ] `curl https://harbourstay-alb-….us-west-2.elb.amazonaws.com/health` → wait, that
      will fail TLS (cert is for `api.hoegun.xyz`). Check via the target group health
      instead, then finish DNS below.

---

## 8. DNS: point `api.hoegun.xyz` at the ALB

In **GoDaddy → DNS → Records → Add**:

| Type | Name | Value |
|---|---|---|
| CNAME | `api` | `harbourstay-alb-….us-west-2.elb.amazonaws.com` |

> Name is `api`, **not** `api.hoegun.xyz` — GoDaddy appends the domain. Same trap as
> the ACM validation record. No trailing dot.

- [ ] `dig +short api.hoegun.xyz` resolves.
- [ ] `curl https://api.hoegun.xyz/health` → `{"status":"ok",…}` with a valid certificate.

---

## 9. Seed the database (one-off)

The image has no `ts-node`, so `prisma db seed` cannot run inside the container, and
RDS is private. The pragmatic path:

1. RDS → Modify → **Publicly accessible: Yes** → apply immediately.
2. `harbourstay-rds-sg` → add inbound TCP 5432 from **your IP /32** only.
3. Locally:
   ```bash
   DATABASE_URL="postgresql://harbourstay:<PASSWORD>@$ENDPOINT:5432/harbourstay?schema=public&sslmode=require" \
     pnpm --filter @harbourstay/api db:seed
   ```
4. **Revert both**: Publicly accessible → **No**, and delete the `/32` inbound rule.

- [ ] `GET https://api.hoegun.xyz/listings` returns the seeded listings.

---

## 10. Frontend on Amplify

Console → **Amplify → Create new app → GitHub** → repo `kenhyou/LBI-Harbourstay`,
branch `main`.

- **Monorepo**: tick "My app is a monorepo", app root = `apps/web`.
- Amplify should detect Next.js (SSR). If the build fails on pnpm workspaces, supply
  the build spec in [`amplify.yml`](../amplify.yml).

**Environment variables** (Amplify → Hosting → Environment variables):

| Key | Value |
|---|---|
| `API_URL` | `https://api.hoegun.xyz` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` |

> `API_URL` has **no** `NEXT_PUBLIC_` prefix on purpose — it must stay server-only.
> Prefixing it would ship your API's address into the browser bundle and bypass the
> route-handler cookie bridge.

**Custom domain**: Amplify → Domain management → Add `hoegun.xyz` → subdomain `app`.
Amplify issues **its own** ACM certificate automatically and prints CNAME records —
paste those into GoDaddy (same "name only" rule).

- [ ] `https://app.hoegun.xyz` loads the listings page.

---

## 11. Stripe webhook (test mode)

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- Endpoint URL: `https://api.hoegun.xyz/webhooks/stripe`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`

Reveal the **Signing secret** (`whsec_…`), then:

```bash
aws ssm put-parameter --name /harbourstay/STRIPE_WEBHOOK_SECRET \
  --type SecureString --overwrite --value "whsec_…"

# ECS only reads secrets at task start — force a new task:
aws ecs update-service --cluster harbourstay --service harbourstay-api --force-new-deployment
```

> This `whsec_…` is **different** from the one `stripe listen` gave you locally. The
> CLI's secret only signs CLI-forwarded events.

---

## 12. Smoke test the live cut line

1. `https://app.hoegun.xyz` → register → search listings.
2. Open a listing → pick dates → **Reserve** (creates Booking `PendingPayment` + Hold).
3. Pay with test card **`4242 4242 4242 4242`**, any future expiry / CVC / ZIP.
4. Watch the confirmation page flip to **Confirmed** on its own.
5. Stripe Dashboard → the webhook endpoint shows a `200`.
6. CloudWatch → log group for the task → a `[test-mailer] … booking-confirmed` line
   (~2s later, delivered by the outbox relay's own tick — proof the `@Interval`
   timers really do run on Fargate).

- [ ] Booking `Confirmed`, webhook `200`, notification logged.

---

## 13. Cost & teardown

Rough monthly, after the 12-month RDS free tier:

| Item | ~USD/mo |
|---|---|
| ALB | ~18 |
| Fargate (0.25 vCPU / 1 GB, always on) | ~11 |
| RDS `db.t4g.micro` | free yr 1, then ~15 |
| ECR, SSM, CloudWatch, data transfer | ~1–3 |
| **Total** | **~$30 (yr 1), ~$45 after** |

Your budget alarm is set to **$20** — raise it to $40 so it warns rather than cries wolf.

**Teardown** (between demos), most expensive first:

```bash
aws ecs update-service --cluster harbourstay --service harbourstay-api --desired-count 0
# delete the ALB (biggest single cost), then:
aws rds delete-db-instance --db-instance-identifier harbourstay-db \
  --skip-final-snapshot --delete-automated-backups
```

The ACM cert, ECR images, SSM parameters, and the GoDaddy records cost nothing —
leave them, and re-deploying is quick.

---

## 14. Gotchas, ranked by how much time they cost

1. **`exec format error`** in the task logs → you built `arm64`. Rebuild with
   `--platform linux/amd64`.
2. **`ResourceInitializationError: unable to pull secrets`** → the inline
   `ssm:GetParameters` + `kms:Decrypt` policy is missing from `ecsTaskExecutionRole`.
3. **Task starts, then the target group kills it** → health check grace period too
   short (migrations run first), or the target group port isn't `8080`.
4. **Prisma `P1001` can't reach the database** → `harbourstay-rds-sg` isn't sourced
   from `harbourstay-api-sg`, or `sslmode=require` is missing.
5. **Stripe calls hang / time out** → the task has **no public IP**. Public subnet is
   not enough; `assignPublicIp` must be `ENABLED`.
6. **ACM cert not in the ALB listener dropdown** → it's in the wrong region. ALB certs
   live in the ALB's region (`us-west-2`). The `us-east-1` rule is CloudFront-only.
7. **GoDaddy record silently wrong** → you pasted the FQDN into *Name* and created
   `api.hoegun.xyz.hoegun.xyz`.
8. **Webhook 400 "signature verification failed"** → still holding the `stripe listen`
   secret; use the dashboard endpoint's `whsec_…` and force a new deployment.
