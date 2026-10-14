---
name: entity
description: Create or modify a domain Entity or Value Object. Use when the user needs to model a new entity, add a state transition, add a mutation method, or create a value object.
argument-hint: "Which entity or value object are we building or modifying?"
---

# Entity

Read `docs/ai-rules/entities.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Locate or create the file

Path: `modules/[feature]/entities/[feature].entity.ts`
Spec: `modules/[feature]/entities/[feature].entity.spec.ts`

---

## Step 2 — Constructor

- All fields as constructor parameters, no validation inside.
- Immutable fields (`id`, `userId`, `createdAtUnix`, foreign keys) use `readonly`.
- The constructor is public but only called from `static create()` and the Repository mapper.

```ts
constructor(
  public readonly id: number | null,
  public readonly userId: string,
  public title: string,
  public status: AuctionStatus,
) {}
```

---

## Step 3 — `static create()`

This is the only entry point for creating new records. Validates inputs, throws `BadRequestError` for invalid data, and returns a new instance with `id = null` (or `randomUUID()` for string IDs).

```ts
static create(title: string, userId: string): Auction {
  if (title.trim().length < 3) throw new BadRequestError("Title too short.");
  return new Auction(null, userId, title, "DRAFT");
}
```

For string IDs generated in the application:
```ts
return new Item(randomUUID(), ...);
```

---

## Step 4 — `toPersistence()`

Returns a plain object with only the fields the Repository should write. Omit `id`, `createdAt`, and any bank-managed fields. Never return the entity instance itself.

```ts
toPersistence() {
  return { userId: this.userId, title: this.title, status: this.status };
}
```

---

## Step 5 — Mutation methods (if needed)

Separate the guard predicate from the command that mutates state:

```ts
canActivate(): boolean {
  return this.status === "SCHEDULED" && this.startAtUnix <= Date.now();
}

activate(): void {
  if (!this.canActivate()) throw new BadRequestError("Cannot activate auction.");
  this.status = "ACTIVE";
}
```

For optional-field updates, only validate what was actually passed:

```ts
update(data: { title?: string }): void {
  if (data.title !== undefined && data.title.trim().length < 3)
    throw new BadRequestError("Title too short.");
  Object.assign(this, data);
}
```

---

## Step 6 — Throw the right error

| Situation | Error |
|---|---|
| Invalid field value | `BadRequestError` |
| Invalid state transition | `BadRequestError` |
| Operation forbidden for this state | `UnprocessableEntityError` |
| Action not allowed for this user | `ForbiddenError` |

Never use `throw new Error(...)`.

---

## Step 7 — Value Objects (if applicable)

Check `src/shared/validations/` before creating a new one. Use a VO when the rule appears in more than one place or has a domain name (email, password, etc.). Use inline validation when the rule is specific to one entity.

To create a new Value Object, invoke the `/value-object` skill.

---

## Step 8 — Verify checklist

- [ ] No Prisma, repository, or HTTP imports
- [ ] No `console.log` or I/O
- [ ] `static create()` validates all inputs
- [ ] `toPersistence()` excludes id and managed fields
- [ ] Mutation methods check pre-condition before mutating
- [ ] Spec covers: valid creation, invalid creation, state transitions, mutations
