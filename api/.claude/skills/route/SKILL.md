---
name: route
description: Create or modify a Route. Use when the user needs to register a new endpoint, add middlewares, define a Zod schema, set up CASL permissions, or wire dependencies for an operation.
argument-hint: "Which route or endpoint are we implementing?"
---

# Route

Read `docs/ai-rules/route.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Locate or create the file

Path: `modules/[feature]/routes/[action]-[feature].route.ts`

If this is the first route in the module, also create `modules/[feature]/routes/_index.ts`.

---

## Step 2 — Structure: dependencies → middlewares → endpoint

```ts
export async function createAuctionRoute(app: FastifyInstance) {
  // 1. Instantiate dependencies
  const auctionRepository = new PrismaAuctionRepository();
  const useCase = new CreateAuctionUseCase(auctionRepository);
  const controller = new CreateAuctionController(useCase);

  // 2. Register middlewares
  app.register(requireTenant);
  app.register(authOrganization);

  // 3. Register endpoint
  app.post("/auctions", { schema: { ... } }, controller.handle.bind(controller));
}
```

**Always use `.bind(controller)`** — without it, `this` is undefined inside `handle`.

---

## Step 3 — Choose middlewares

| Middleware | When to use | What it provides |
|---|---|---|
| `requireTenant` | Any org route | `req.tenant` |
| `authOrganization` | Org member routes | `req.authOrganizationMemberId`, CASL `req.ability` |
| `auth` | End-user routes via Clerk | `req.authUserId` |
| `requireAuctioneer` | Auctioneer routes | `req.authAuctioneerId` |

`requireTenant` must come before `authOrganization`. Only register what the route actually needs.

---

## Step 4 — CASL permissions (org routes only)

```ts
app.post("/", {
  config: {
    permissions: { action: "create", subject: "OrganizationMember" },
  },
  schema: { ... },
}, controller.handle.bind(controller));
```

Omit `config.permissions` only when any authenticated member can access the route.

---

## Step 5 — Define the Zod schema

Include all possible response status codes with `.describe()`:

```ts
schema: {
  tags: [swaggerTags.Auction],
  summary: "Create Auction",
  description: "Creates a new auction for the organization",
  body: createAuctionSchema,
  response: {
    201: auctionResponseSchema.describe("Auction created"),
    400: httpBadRequestSchema.describe("Invalid data"),
    403: httpForbiddenSchema.describe("Insufficient permissions"),
    404: httpNotFoundSchema.describe("Organization not found"),
  },
}
```

- `tags` must use `swaggerTags` constants — never string literals.
- `summary` is required. `description` is recommended.
- For error schemas import from `@/shared/schemas/http-error.schema.ts`.
- For entity response schemas import from the module's `schema/[feature].schema.ts`.

---

## Step 6 — Rate limiting (side-effect endpoints)

For endpoints that send emails, OTPs, or trigger expensive operations:

```ts
config: {
  rateLimit: { max: 1, timeWindow: "120 seconds" },
},
```

---

## Step 7 — Register in `_index.ts`

```ts
export async function AuctionRoutes(app: FastifyInstance) {
  app.register(createAuctionRoute);
  app.register(getAuctionRoute);
  // ...
}
```

`_index.ts` only aggregates — no logic, no instantiation.

---

## Step 8 — Verify checklist

- [ ] Order: dependencies → middlewares → endpoint
- [ ] `.bind(controller)` on every handler
- [ ] Correct middlewares registered (and only those needed)
- [ ] Zod schema covers all status codes with `.describe()`
- [ ] Error schemas imported from shared, not written inline
- [ ] `swaggerTags` used — no string literals for `tags`
- [ ] Route added to `_index.ts`
- [ ] No business logic in the route
