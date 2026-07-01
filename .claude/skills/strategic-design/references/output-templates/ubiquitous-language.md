# Ubiquitous Language Output Template

A glossary defining key terms for each Bounded Context. The core learning point is finding cases where **the same word has different meanings in different BCs**.

Location: `docs/strategic-design/05-ubiquitous-language.md` (PRD mode) or `docs/<sub-domain>/strategic-design/05-ubiquitous-language.md` (Socratic mode).

---

## Writing Principles

1. **Create an independent glossary per BC.** The same word may have different definitions in different BCs.
2. **Keep each definition to one sentence.** If a definition is vague, the BC may be too large.
3. **Include the "Meaning in other BCs" column.** Make differences explicit.
4. **Define 5-15 terms per BC.** Too few can mean the BC is trivial; too many can mean the BC is too large.
5. **Use field vocabulary directly.** Avoid over-generalization. Do not rename `Order` to `Transaction` without a domain reason.

---

## Template

```markdown
# {Domain} Ubiquitous Language

Core term definitions per Bounded Context. Highlight cases where the same word has different meanings in different BCs.

---

## BC-1: {Sales}

### Responsibility
{One paragraph describing what this BC owns in the business.}

### Glossary

| Term | Definition in This BC | Meaning in Other BCs |
|---|---|---|
| Order | A set of products that a customer intends to buy. States: PENDING/CONFIRMED/CANCELLED. | In Shipping, source data for a Shipment. In Billing, a trigger for Invoice creation. |
| Customer | A person with purchase intent, identified by email regardless of membership. | In Auth, a User with login credentials. In CRM, the result of a converted Lead. |
| Cart | A temporary product collection before checkout; converted into an Order at checkout. | Does not appear in other BCs. |
| Product | The selling unit: SKU, price, and availability information. | In Inventory, stock-tracking unit. In Marketing, promotion target. |

---

## BC-2: {Inventory}

### Responsibility
{...}

### Glossary

| Term | Definition in This BC | Meaning in Other BCs |
|---|---|---|
| SKU | A stock-tracking unit for a product variant, not a physical instance. | In Sales, often shown as Product. |
| Stock | Available quantity for a SKU at a location. | Sales only reads it as remaining availability. |
| Reservation | A temporary hold on a SKU for a limited time. | In Sales, similar to being in a cart. |

---

## Same Word, Different Meaning

### Case 1: "Order"
- **Sales BC**: the customer's purchase intent and core model.
- **Shipping BC**: input data for fulfillment, using only address and item details.
- **Billing BC**: a trigger for Invoice creation, focused on amount and payment.

**Why this matters**: the same word represents different concerns. Sales models business intent, Shipping models physical movement, and Billing models financial transaction.

### Case 2: "Customer"
- **Sales BC**: a person with purchase intent.
- **Auth BC**: a User with login credentials.
- **CRM BC**: a later stage of a Lead in a relationship pipeline.

**Why this matters**: the same person is viewed through different lenses: identity, transaction, and relationship.
```

---

## Verification Checklist

- [ ] Every BC defines at least five terms.
- [ ] At least one same-word-different-meaning case is highlighted.
- [ ] Each term definition is clear and one sentence long.
- [ ] Each BC has a one-paragraph responsibility statement.

---

## Common Mistakes

### Mistake 1: All BCs Use the Same Terms with the Same Meaning

- **Symptom**: the "Meaning in other BCs" column is empty or says "same" everywhere.
- **Suspicion**: the split may not be meaningful enough.
- **Response**: ask Domain Expert whether the term truly has no different nuance across BCs.

### Mistake 2: Definitions Are Too Abstract

- **Bad example**: "Order is a transaction unit."
- **Good example**: "Order is a set of products that a customer intends to buy, created in PENDING state and later confirmed or cancelled."
- **Difference**: the good definition includes state, creation point, and identity cues.

### Mistake 3: Replacing Field Language with Generic Language

- **Symptom**: people in the field say one term, but the artifact uses a generic substitute.
- **Response**: preserve the vocabulary the domain experts actually use.
- **Reason**: Ubiquitous Language breaks when it stops matching real communication.

### Mistake 4: Too Many Terms

- **Suspicion**: the BC may be too large, or the glossary lists incidental attributes.
- **Response**: keep core nouns only: Aggregate Root candidates, major Entities, and key VOs.

### Mistake 5: Too Few Terms

- **Suspicion**: the BC may be too small or Domain Expert analysis was shallow.
- **Response**: compare against the domain event list and define nouns that appear in events.
