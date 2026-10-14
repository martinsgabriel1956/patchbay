---
name: use-case
description: Create or modify a Use Case. Use when the user needs to implement business logic, orchestrate repositories and services, handle domain errors, or add audit logging to an operation.
argument-hint: "Which use case or operation are we implementing?"
---

# Use Case

Read `docs/ai-rules/use-case.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Locate or create the file

Path: `modules/[feature]/use-cases/[action]-[feature].use-case.ts`
Spec: `modules/[feature]/use-cases/[action]-[feature].use-case.spec.ts`

---

## Step 2 — Constructor

Inject all dependencies as interfaces, never concrete implementations:

```ts
export class CreateAuctionUseCase {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly auditLogger: AuditLogger,
  ) {}
}
```

`AuditLogger`, `IEventBus`, `MailerService`, `RedisService` are all injected here. Never instantiate them internally.

---

## Step 3 — Method signature: always `execute`

```ts
async execute(organizationId: string, data: CreateAuctionRequest, context: Context): Promise<Auction>
```

- Method is always named `execute`.
- `Context` is a parameter of `execute` (not the constructor) — and only when the use case actually audits.
- Return the persisted entity for CREATEs, `Promise<void>` for mutations without a relevant return.

---

## Step 4 — Follow the execution order

```
1. Fetch data via repository
2. Validate existence → NotFoundError if absent
3. Check authorization → ForbiddenError if denied
4. Apply business rule (via entity method or use case logic)
5. Persist via repository
6. Side effects (email, event bus)
7. Audit log (always last)
8. Return result
```

Never invert this order. Checking auth before fetching exposes existence information. Persisting before validating leaves inconsistent state.

---

## Step 5 — Throw the right error

| Situation | Error |
|---|---|
| Record not found | `NotFoundError` |
| Not allowed for this user | `ForbiddenError` |
| Invalid input or business rule | `BadRequestError` |
| Operation forbidden for current state | `UnprocessableEntityError` |
| Duplicate record | `ResourceConflitError` |

Never use `new Error(...)`. Never use `try/catch`.

---

## Step 6 — Business rule placement

- **In the entity**: state transitions, invariants, calculations internal to the object.
- **In the use case**: rules that involve multiple objects, counts, or external resources.

```ts
// entity method handles the transition
auction.publish();

// use case handles cross-object rule
const count = await this.repo.countFeaturedByOrg(organizationId);
if (count >= MAX_FEATURED) throw new UnprocessableEntityError("Limit reached.");
auction.feature();
```

Business rule constants (`MAX_FEATURED`, `MAX_ADDRESSES_PER_USER`) are declared as `const` at the top of the use case file unless shared by multiple use cases.

---

## Step 7 — Parallel async operations

```ts
// correct — independent operations run in parallel
await Promise.all([
  this.mailerService.sendWelcome(user.email),
  this.eventBus.publish({ type: "user.created", payload: user }),
]);
```

Only operations that depend on each other should remain sequential.

---

## Step 8 — Return value for list queries

Do not return `Entity[]`. Map to a plain object with only the fields needed for the response:

```ts
return auctions.map((a) => ({
  id: a.id,
  title: a.title,
  status: a.status,
  startAtUnix: a.startAtUnix,
}));
```

---

## Step 9 — Verify checklist

- [ ] No Fastify, Prisma, or HTTP imports
- [ ] No `try/catch`
- [ ] No `return { error: "..." }` — throws domain errors
- [ ] No `process.env` access
- [ ] `execute` follows the 8-step order
- [ ] `Context` passed only when audit is used
- [ ] List queries return plain objects, not Entity[]
- [ ] Independent async operations use `Promise.all`
- [ ] Spec covers: happy path, not-found, forbidden, and business-rule violations
