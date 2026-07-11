# Harbourstay — Delivery Metrics (DORA)

> Part of S7 (Hardening), PRD §13. Measures *how this codebase was delivered*, not what it does.
> Figures are computed from this repo's real git history (`git log`) and the deploy record in
> [PROGRESS.md](PROGRESS.md) / [../DEPLOY.md](../DEPLOY.md) — not estimated.

## ⚠️ Read this caveat first

The four **DORA** keys (Deployment Frequency, Lead Time for Changes, Change Failure Rate, Time to
Restore) were designed to measure **team** software delivery over months. Harbourstay is a **solo,
AI-agent-assisted learning build** run over ten days. So these numbers are **illustrative, not a
benchmark**: the sample is tiny (≈9 slices), there is no PR-review or CI-queue latency to absorb
(which flatters lead time), and only the S4 cut line is actually deployed to production (the rest are
*releasable* on a green `main`, not continuously deployed). Treat them as a picture of the build's
*cadence and discipline*, not an org-level score.

## Raw data (from git + the deploy record)

| Fact | Value |
|---|---|
| Project span | **2026-07-02 → 2026-07-12** (10 days) |
| Commits | 45 |
| Merge commits | 6 (branch-per-slice began at S4; P0–S3 landed directly on `main`) |
| Shippable increments | **9** — P0, S1, S2, S3, S4, S5, S6a, S6b, S7a (each ends on a green `main`) |
| Production deploys | **1** formal — the S4 cut line to AWS (2026-07-10), plus in-place ECS redeploys (e.g. the Stripe-key rotation) |
| `main` status | green after every increment (PRD §12 invariant) |

Merge cadence (tightening as the workflow matured):

```
2026-07-07 23:39  Merge S4     (payment saga — the deployable cut line)
2026-07-10 02:31  Merge deploy-aws  (ship the cut line to AWS)
2026-07-11 18:38  Merge S5     (my bookings + cancel)
2026-07-11 23:18  Merge S6a    (host listings CRUD + RBAC)
2026-07-11 23:55  Merge S6b    (availability blocks + host bookings)
2026-07-12 00:56  Merge S7a    (security baseline)
```

## The four keys

### 1. Deployment Frequency — *how often we ship*
**~1 releasable increment/day** (9 green-`main` slices over 10 days); **1** of them pushed to
production (the cut line, by design — the rest are release-ready but this is not a continuous-deployment
setup). Using merge-to-green-`main` as the proxy DORA intends for "deployable," this sits in the
**Elite** band (on-demand / multiple per day in the S5→S7a stretch: four merges inside ~30 hours).
*Caveat:* the proxy counts releasability, not actual production releases.

### 2. Lead Time for Changes — *code-complete → running*
- **Slice → green `main`: minutes** (median ≈ same session; the branch feature-commit and its merge are
  in the same minute for S6a/S6b/S7a). **Elite** band — but honestly, a solo build has no code-review
  or CI-queue wait to absorb, so this is a floor, not a feat.
- **Idea → first production: 8 days** (first commit 2026-07-02 → AWS deploy 2026-07-10) for the entire
  P0→S4 cut line — i.e. eight days from empty repo to a live, Stripe-test-paying app on AWS.

### 3. Change Failure Rate — *how often a change breaks things*
**Low — one escaped defect.** Of the notable changes, exactly **one reached a running/deployed state
and needed remediation**: the S4-deploy incident where a Stripe `sk_test_` secret was inlined into the
browser bundle via a `NEXT_PUBLIC_` var (rolled + redeployed same session). Nearly everything else was
caught **before** merge/prod by the build's verify-before-done discipline:
- the Dockerfile `pnpm prune` crash-loop (green build, dead container) — caught by *booting* the image;
- Amplify's `WEB_COMPUTE` missing-`next` and the SSR `API_URL` fallback — caught during deploy;
- the S6a `publish-toggle` stuck-button — caught by the `integration-verifier` before S6a merged.

These are **caught-failures, not change-failures** — they never reached a user. Counting only escapes,
CFR ≈ **1 / 9 ≈ 11%**, and that one was a config/secrets slip, not a logic regression.

### 4. Time to Restore — *how fast we recover*
**< 1 hour**, one data point: the leaked-key incident was detected and fully remediated in the same
working session (rotate the key in Stripe → update the SSM SecureString → `force-new-deployment` on
ECS → re-scan all 17 served chunks clean). No production outage occurred; "restore" here means closing
the exposure. **Elite** band by duration, single sample.

## What actually drove these numbers

The cadence isn't the interesting part — the **discipline** is. Two invariants did the heavy lifting:

1. **Every slice runs and is verified before it's "done"** (curl + browser + the `integration-verifier`).
   This is why the failure *rate* is low: the expensive bugs (crash-looping container, permanently
   disabled button) were caught at the boot/verify step, not in production. A green test suite was
   explicitly *not* treated as proof of safety — the S7a audit found a real auth-forgery vuln that all
   345 green tests had run on.
2. **`main` stays green; deploy early.** The cut line went to AWS at S4 (day 8), so every later slice
   shipped against a real deployed baseline rather than a big-bang release at the end.

## Limitations / honesty

- **n is tiny** and the window is 10 days — directional only.
- **No hosted CD pipeline**: CI (`.github/workflows/ci.yml`) runs lint/typecheck/test/build on push;
  production deploys are **manual** (AWS console runbook, [../DEPLOY.md](../DEPLOY.md)). "Deployment
  frequency" is therefore a *releasability* proxy, not a release count.
- **Solo + AI-assisted**: no review/approval latency, which makes lead time artificially short versus a
  team. The realistic team-equivalent lead time would be higher (review + CI queue + release windows).
- **Change-failure accounting is generous to the process** by design: it counts only escapes, because
  the whole point of the verify-before-done rule is to convert would-be change-failures into
  caught-failures.

## Follow-ups (would sharpen these metrics)

- Automate production deploys (CDK/Terraform + a deploy pipeline) so Deployment Frequency becomes a
  real release count, not a proxy (already a documented S7/post-S7 follow-up, ADR-0010).
- Add CI coverage + a coverage badge (S7c) and a deploy-event log so lead time and CFR can be measured
  continuously rather than reconstructed from git.
