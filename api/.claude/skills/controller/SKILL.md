---
name: controller
description: Create or modify a Controller. Use when the user needs to implement a new controller, review an existing one, or understand what belongs (and what doesn't) in this layer.
argument-hint: "Which controller or operation are we implementing?"
---

# Controller

Read `docs/ai-rules/controller.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Locate or create the file

Path: `modules/[feature]/controller/[action]-[feature].controller.ts`

The controller is a class with a single public `handle` method. No other public methods.

---

## Step 2 — Constructor

Inject the Use Case via the constructor. The controller never instantiates dependencies itself.

```ts
constructor(private readonly createAuctionUseCase: CreateAuctionUseCase) {}
```

---

## Step 3 — Signature

Use the schema type for `FastifyRequest`. Never write manual inline types in the controller.

```ts
async handle(req: FastifyRequest<{ Body: CreateAuctionSchema }>, reply: FastifyReply)
```

Import the schema type from the module's schema file (`Body`, `Params`, `Querystring`).

---

## Step 4 — Extract from request

| Source | Access |
|---|---|
| Body | `req.body` |
| Route params | `req.params` |
| Query string | `req.query` |
| Authenticated user | `req.authUserId`, `req.authAuctioneerId`, `req.authOrganizationMemberId` |

Do not extract more fields than the Use Case actually needs. Do not check if `authUserId` is null — the middleware already validated it.

---

## Step 5 — Build context (only when the use case audits)

```ts
const context: Context = {
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"] ?? "",
  author: req.authUserId,
};
```

Only pass context when the Use Case actually uses it.

---

## Step 6 — Call the Use Case and reply

```ts
const result = await this.useCase.execute(data, context);
return reply.status(201).send({ id: result.id });
```

Status codes:
- `201` — resource created
- `200` — operation with response body
- `204` — operation with no response body (`reply.status(204).send()`)

Never return the domain entity directly. Select only the fields safe to expose.

---

## Step 7 — Verify checklist

- [ ] No business logic (`if` on domain rules)
- [ ] No direct Prisma access
- [ ] No `try/catch`
- [ ] No re-validation of Zod-validated input
- [ ] No check whether the authenticated user exists
- [ ] Schema type used for `FastifyRequest`, not inline type
- [ ] Sensitive fields (passwordHash, salt) excluded from response
- [ ] Cookie options include `httpOnly: true`, conditional `secure`, `sameSite: "lax"` if applicable
