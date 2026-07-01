# Strategic Design Anti-Patterns

Common traps when splitting Bounded Contexts or creating a Context Map. When the skill sees the user falling into one of these traps, use this document to guide them.

---

## Anti-Pattern 1: Entity-per-BC

### Symptom

The user splits BCs by database-table-like nouns: User BC, Order BC, Product BC, Cart BC, Payment BC.

### Why It Is a Problem

- A BC is a **language boundary**, not a table boundary.
- Splitting by data model creates too much inter-BC communication and often leads to distributed transaction pain.
- It confuses Tactical Design Entity with Strategic Design BC.

### Learning Point

- BCs group by business capability or Subdomain, not data.
- Example: the concept `User` may be Customer in Sales, Member in Loyalty, and Account in Auth. Different meanings can justify different BCs.

### Skill Response

If the user proposes a plain noun list, ask:

> Describe each BC's business responsibility in one sentence. Avoid "manages X"; use "provides this business value".

---

## Anti-Pattern 2: Org-Chart Split

### Symptom

The user says the company has Sales, Logistics, and Accounting teams, so BCs should match those teams.

### Why It Is a Problem

- The org structure may already be wrong or historical.
- Aligning BCs to the org chart can harden a poor domain model.
- Conway's Law is an observation, not a prescription.

### Learning Point

- Model the domain first, then adjust the organization if possible.
- It is normal for organization boundaries and BC boundaries to differ.

### Skill Response

Ask:

> If we ignore the current organization and split by business capability, what would the boundaries be? How closely do they match the current teams?

---

## Anti-Pattern 3: BC Too Large

### Symptom

Only three or four BCs emerge, but each one tries to do everything. Example: Sales BC handles orders, payments, shipping, and refunds.

### Why It Is a Problem

- The model inside the BC becomes too complex and language becomes muddy.
- It tends to end in one large database and monolithic code.
- It is effectively not splitting.

### Learning Point

- BCs split where language changes meaning.
- If the same word has two meanings inside one BC, the BC may be too large.

### Skill Response

Ask:

> Does any word inside this BC have different meanings? For example, does `Order` mean different things from a sales perspective and a logistics perspective?

---

## Anti-Pattern 4: BC Too Small

### Symptom

More than twenty BCs appear, each with only one or two actions.

### Why It Is a Problem

- Communication cost explodes.
- Transaction boundaries become too fragmented.
- Operational burden grows through too many deployment units.

### Learning Point

- A BC should be an autonomous meaningful unit, not a function.
- A useful heuristic: one team can meaningfully evolve it for 6-12 months.

### Skill Response

Ask:

> If each BC's one-sentence description contains only one action, does it really need to be a separate BC?

---

## Anti-Pattern 5: Confusing Subdomain and BC

### Symptom

The user treats Sales Subdomain and Sales BC as automatically identical.

### Why It Is a Problem

- **Subdomain** is a problem-space division.
- **Bounded Context** is a solution-space division.
- Mapping can be 1 Subdomain to many BCs, or rarely one BC spanning multiple Subdomains.

### Learning Point

- Subdomain asks what business problem is handled.
- BC asks how the model is bounded.

### Skill Response

Ask:

> Let's separate Subdomain from BC. Inside this Subdomain, are there areas with different language or models?

---

## Anti-Pattern 6: All BCs Treated Equally

### Symptom

Every BC receives the same design depth and priority.

### Why It Is a Problem

- Time and resources are limited.
- Core Subdomain BCs deserve the most investment.
- Generic Subdomains may be bought or delegated.

### Learning Point

- Core/Supporting/Generic classification guides investment.
- Buy or adopt Generic, build Supporting only as needed, and invest deeply in Core.

### Skill Response

If every Subdomain is Core in Phase 2, ask:

> Is everything truly a differentiator? Are there areas competitors already solve in similar ways?

---

## Anti-Pattern 7: Bidirectional Dependency Between BCs

### Symptom

The Context Map contains both A -> B and B -> A.

### Why It Is a Problem

- BC autonomy collapses.
- Changes require coordinated deployment.
- It may actually be one BC split into two names.

### Learning Point

- BC relationships should usually be directional.
- True bidirectional coupling should be modeled as Partnership and accepted as a strong coupling cost.

### Skill Response

Ask:

> If A and B depend on each other, are they actually one BC? Or are they a Partnership where one team owns both together?

---

## Template for New Anti-Patterns

Add new patterns here as they are discovered:

```markdown
## Anti-Pattern N: {Name}

### Symptom
### Why It Is a Problem
### Learning Point
### Skill Response
```
