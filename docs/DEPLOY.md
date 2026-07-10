# Harbourstay — AWS Deployment Runbook

Deploys the **S4 cut line** (search → reserve → pay-test → confirm) to AWS.
Console-driven, with CLI where the console cannot help (building images).

> **Stripe stays in TEST MODE.** No real money moves (PRD §2 N4). Never put a
> live `sk_live_…` key anywhere in this runbook.

---

## 0. Fill these in for your account

This runbook uses placeholders. **No real account identifiers are committed here** —
substitute your own as you go. Keep the filled-in values somewhere private (a password
manager or an untracked scratch file), never in the repo.

| Placeholder | What it is | How to get it |
|---|---|---|
| `<ACCOUNT_ID>` | your 12-digit AWS account id | `aws sts get-caller-identity --query Account --output text` |
| `<REGION>` | the one region everything lives in | pick one (e.g. an `*-west-*` region) and be consistent — ACM certs for an ALB must live in the ALB's region |
| `<VPC_ID>` | the default VPC | `aws ec2 describe-vpcs --filters Name=isDefault,Values=true` |
| `<SUBNET_A>` `<SUBNET_B>` | two **public** subnets in different AZs | `aws ec2 describe-subnets --filters Name=vpc-id,Values=<VPC_ID>` — need `MapPublicIpOnLaunch: true` |
| `<IGW_ID>` | the VPC's internet gateway (egress to Stripe) | `aws ec2 describe-internet-gateways` |
| `<CERT_ARN>` | ACM cert for `api.harbourstay.xyz` | request it in step 0b; must live in `<REGION>` |
| `<ALB_DNS>` | the load balancer's DNS name | printed once the ALB is `active` |
| `<RDS_ENDPOINT>` | the database hostname | printed once RDS is `available` |
| `harbourstay.xyz` | stand-in for **your** registered domain throughout this doc | substitute yours |

Hostnames this runbook creates:

| Host | Points at | Purpose |
|---|---|---|
| `api.harbourstay.xyz` | ALB | the API + the Stripe webhook endpoint |
| `app.harbourstay.xyz` | Amplify | the Next.js frontend |

> ⚠️ **Subdomains only — never the apex.** A `CNAME` is illegal at the apex by DNS
> spec, and an ALB has no fixed IP, so an `A` record is impossible too. Only Route 53's
> proprietary `ALIAS` works there. If your apex already serves something, leave it alone.

> ⚠️ **Most registrar DNS panels append your domain to the `Name` field.** Enter `api`,
> not `api.harbourstay.xyz` — otherwise you create `api.harbourstay.xyz.harbourstay.xyz` and spend an hour
> wondering why nothing resolves. No trailing dots either.

Every CLI command below assumes:

```bash
export AWS_PROFILE=<YOUR_PROFILE>
export AWS_REGION=<REGION>
```

---

## 0b. Request the HTTPS certificate (do this early — validation takes minutes)

Stripe webhooks require HTTPS, and ACM will not issue a certificate for an
`*.amazonaws.com` name — which is why an owned domain is mandatory here.

```bash
aws acm request-certificate \
  --domain-name api.harbourstay.xyz \
  --validation-method DNS \
  --query CertificateArn --output text
```

Then read the CNAME that ACM wants and create it at your registrar:

```bash
aws acm describe-certificate --certificate-arn <CERT_ARN> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

- Enter only the part **before** your domain in the *Name* field (the registrar appends
  the rest). Strip trailing dots from both fields.
- Status flips `PENDING_VALIDATION → ISSUED` in ~5–30 minutes.
- **Never delete that CNAME.** ACM re-reads it to auto-renew; remove it and the
  certificate silently fails to renew a year later.

> The certificate must be requested in **`<REGION>`** — the ALB's own region. The
> widely-repeated "certs must be in `us-east-1`" rule applies **only to CloudFront**.
> Get this wrong and the cert simply never appears in the ALB listener's dropdown.

You do **not** request a certificate for `app.harbourstay.xyz`: Amplify provisions and
renews its own (step 10).

---

## The topology, and why

```
                    ┌──────────────┐
  browser ─https──▶ │   Amplify    │  app.harbourstay.xyz   (Next.js SSR/RSC)
                    └──────┬───────┘
                           │ server-side fetch (API_URL)
                           ▼
                    ┌──────────────┐
  Stripe ─webhook─▶ │     ALB      │  api.harbourstay.xyz   (TLS terminates here, ACM)
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
cd <repo-root>
ACCOUNT=<ACCOUNT_ID>
ECR=$ACCOUNT.dkr.ecr.<REGION>.amazonaws.com
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

All in `<VPC_ID>`. Leave outbound as the default "all traffic" —
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
| VPC | `<VPC_ID>` |
| **Public access** | **No** |
| Security group | `harbourstay-rds-sg` (remove `default`) |
| Initial database name | `harbourstay` (under *Additional configuration* — **easy to miss**) |
| Backups | 7 days (or 0 to save a little) |

Takes ~10 minutes. When the endpoint appears, write the real connection string:

```bash
ENDPOINT=<RDS_ENDPOINT>
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
| VPC | `<VPC_ID>` |
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

- [ ] ALB state `active`; note its DNS name (`<ALB_DNS>`).

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
      "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/harbourstay/*",
      "arn:aws:kms:<REGION>:<ACCOUNT_ID>:alias/aws/ssm"
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
| Image URI | `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/harbourstay-api:latest` |
| Port mapping | **8080** TCP |
| Log driver | `awslogs` (Console offers to create the log group) |

**Environment variables** (plain):

| Key | Value |
|---|---|
| `WEB_ORIGIN` | `https://app.harbourstay.xyz` |

`PORT=8080` and `NODE_ENV=production` are already baked into the image.

**Secrets** (`ValueFrom` → SSM parameter ARN), one row each:

`DATABASE_URL` · `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET`

ARN form: `arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/harbourstay/DATABASE_URL`

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
- [ ] `curl https://<ALB_DNS>/health` → wait, that
      will fail TLS (cert is for `api.harbourstay.xyz`). Check via the target group health
      instead, then finish DNS below.

---

## 8. DNS: point `api.harbourstay.xyz` at the ALB

In **your DNS provider → DNS → Records → Add**:

| Type | Name | Value |
|---|---|---|
| CNAME | `api` | `<ALB_DNS>` |

> Name is `api`, **not** `api.harbourstay.xyz` — the registrar appends the domain. Same trap as
> the ACM validation record. No trailing dot.

- [ ] `dig +short api.harbourstay.xyz` resolves.
- [ ] `curl https://api.harbourstay.xyz/health` → `{"status":"ok",…}` with a valid certificate.

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

- [ ] `GET https://api.harbourstay.xyz/listings` returns the seeded listings.

---

## 10. Frontend on Amplify

Console → **Amplify → Create new app → GitHub** → repo `<GITHUB_OWNER>/<REPO>`,
branch `main`.

- **Monorepo**: tick "My app is a monorepo", app root = `apps/web`.
- Amplify should detect Next.js (SSR). If the build fails on pnpm workspaces, supply
  the build spec in [`amplify.yml`](../amplify.yml).

**Environment variables** (Amplify → Hosting → Environment variables):

| Key | Value |
|---|---|
| `API_URL` | `https://api.harbourstay.xyz` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` |

> `API_URL` has **no** `NEXT_PUBLIC_` prefix on purpose — it must stay server-only.
> Prefixing it would ship your API's address into the browser bundle and bypass the
> route-handler cookie bridge.

**Custom domain**: Amplify → Domain management → Add `harbourstay.xyz` → subdomain `app`.
Amplify issues **its own** ACM certificate automatically and prints CNAME records —
paste those into your DNS provider (same "name only" rule).

- [ ] `https://app.harbourstay.xyz` loads the listings page.

---

## 11. Stripe webhook (test mode)

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- Endpoint URL: `https://api.harbourstay.xyz/webhooks/stripe`
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

1. `https://app.harbourstay.xyz` → register → search listings.
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

The ACM cert, ECR images, SSM parameters, and the DNS records cost nothing —
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
   live in the ALB's region (`<REGION>`). The `us-east-1` rule is CloudFront-only.
7. **A DNS record silently wrong** → you pasted the FQDN into *Name* and created
   `api.harbourstay.xyz.harbourstay.xyz`.
8. **Webhook 400 "signature verification failed"** → still holding the `stripe listen`
   secret; use the dashboard endpoint's `whsec_…` and force a new deployment.
9. **Amplify: `CustomerError: The 'node_modules' folder is missing the 'next' dependency`**
   → the build *succeeded*; the **deploy** failed. Amplify packages `<appRoot>/node_modules`
   and cannot follow pnpm's symlinks out to `../../node_modules/.pnpm`. `amplify.yml` appends
   `node-linker=hoisted` to `.npmrc` **during the build** and copies the hoisted root
   `node_modules` under `apps/web`. Do **not** commit that `.npmrc` line — repo-wide it empties
   `apps/api/node_modules` and breaks `apps/api/Dockerfile`.
10. **Deployed pages show the error boundary; CloudWatch says `ECONNREFUSED 127.0.0.1:3001`**
    → Amplify injects console env vars into the **build** container only. A Next.js server
    component sees nothing at runtime (deliberate, so build secrets can't leak), so
    `process.env.API_URL` is `undefined` and the code falls back to its localhost default.
    `amplify.yml` writes `API_URL` into `apps/web/.env.production` before `next build`.
    Amplify's own SSR logs are in CloudWatch log group `/aws/amplify/<appId>`.
11. 🚨 **Never put an `sk_` key in a `NEXT_PUBLIC_` variable.** `NEXT_PUBLIC_` is a *publishing
    instruction*: Next.js inlines the value into JavaScript served to every browser. `pk_test_`
    (publishable) and `sk_test_` (secret) differ by two characters and sit next to each other in
    the Stripe dashboard. If it happens: **roll the key in Stripe first**, then update SSM, force
    a new ECS deployment, fix the Amplify variable, and rebuild (the value is baked in at build).
