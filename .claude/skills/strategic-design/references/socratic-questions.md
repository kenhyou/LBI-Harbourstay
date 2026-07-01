# Socratic Questions for Phases 1 and 6

These are questions the skill asks directly. **Do not ask them all at once.** Ask one question, wait for the answer, then ask the next.

---

## Phase 1: Domain Discovery

### Five Required Priority Questions

**Q1. Who is the primary actor? Who are the secondary actors?**
- Intent: clarify who the system is for. Internal operators are often forgotten.
- Follow-up: if the user names only one actor, ask whether there are admin or operations-side users.

**Q2. What are the core domain events in this system? List about 5-10.**
- Intent: Big Picture Event Storming. Encourage verb + past-tense phrasing such as `OrderCreated` or `PaymentCompleted`.
- Follow-up: if fewer than five are provided, ask to trace the user journey from beginning to end.

**Q3. What are the key business KPIs for this system? Name 2-3.**
- Intent: provide a basis for business-value hypotheses during Subdomain classification.
- Examples: revenue, active users, transaction success rate, retention, average response time.

**Q4. Compared with competitors or similar systems, what differentiates this system?**
- Intent: identify clues for Core Subdomains. Areas with no differentiation may be Generic.
- Follow-up: if the user cannot answer, ask whether the area is worth building directly if all systems are similar.

**Q5. What is explicitly out of scope?**
- Intent: define system boundaries.
- Examples: use an external payment gateway, do not build customer support, keep analytics out of scope.

### Optional Questions

- What does a typical day look like for the primary actor?
- What decision does the domain operator make most often?
- If this system goes down, what does the user lose first?
- Which external SaaS products solve similar problems? This can identify Generic Subdomains.

---

## Phase 6: Reflection

### Three Required Reflection Questions

**Q1. What was the decision most different from your initial intuition?**
- Intent: measure learning impact. If everything matched intuition, the discussion may not have expanded the user's thinking.
- Follow-up: which phase caused the shift?

**Q2. If you revisit the same domain or a similar domain later, what would you do differently?**
- Intent: metacognition and transfer of learning.
- Follow-up: which role's opinion should you have heard earlier?

**Q3. Write one paragraph on how this result affects Tactical Design (`DESIGN.md`).**
- Intent: connect Strategic and Tactical Design.
- Follow-up: pick one BC and guess one or two Aggregate candidates inside it.

### Extra Questions After the Second Domain

If the user has completed a previous Strategic Design session:

**Q4. Compared with the previous domain (`{prev_domain_name}`), what was similar and what was different?**
- Intent: pattern recognition and generalization of DDD thinking.

**Q5. During this session, did you consciously do anything differently from previous sessions?**
- Intent: self-awareness of improvement.

---

## Questioning Principles

1. **One question at a time.** Avoid overwhelming the user.
2. **Ask follow-ups when answers are thin.** Go one layer deeper instead of merely acknowledging.
3. **Offer options if the user does not know.** Example: for KPIs, ask whether revenue, active users, or retention is closest.
4. **Do not fill reflection answers for the user.** Wait even if the user is quiet. A short user-written answer is better than an AI-written one.
