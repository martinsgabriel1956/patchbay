---
name: factory
description: Create a Factory for a use case. Use when implementing a new route that needs its dependencies wired, or when refactoring an existing route to extract the composition logic.
argument-hint: "Which use case / operation needs a factory?"
---

# Factory

Read `docs/ai-rules/factory.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Locate or create the file

Path: `modules/[feature]/factory/make-[operation-name].factory.ts`

One factory per operation. Never group multiple operations in one factory.

---

## Step 2 — Write the factory function

Naming:
- File: `make-[operation-name].factory.ts`
- Function: `make[OperationName]()`

```ts
import { CreateAuctionController } from "@/modules/auction/controller/create-auction.controller";
import { PrismaAuctionRepository } from "@/modules/auction/repository/prisma/prisma-auction.repository";
import { CreateAuctionUseCase } from "@/modules/auction/use-cases/create-auction.use-case";

export function makeCreateAuction() {
  const auctionRepository = new PrismaAuctionRepository();

  const useCase = new CreateAuctionUseCase(auctionRepository);
  const controller = new CreateAuctionController(useCase);

  return { useCase, controller };
}
```

---

## Step 3 — Use the factory in the route

```ts
export async function createAuctionRoute(app: FastifyInstance) {
  const { controller } = makeCreateAuction();

  app.register(requireTenant);
  app.register(authOrganization);

  app.post("/auctions", { schema: { ... } }, controller.handle.bind(controller));
}
```

The route now has a single responsibility: define the HTTP contract.

---

## Step 4 — Verify checklist

- [ ] Factory instantiates only Prisma/real implementations — never InMemory
- [ ] Returns `{ useCase, controller }`
- [ ] One factory per operation
- [ ] Factory does not register routes, configure middlewares, or know HTTP
- [ ] Route desestructs only what it needs (usually just `controller`)
- [ ] Tests compose Use Cases manually with InMemory repos — they do NOT use the factory
