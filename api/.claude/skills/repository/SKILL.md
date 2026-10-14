---
name: repository
description: Create or modify a Repository (interface, Prisma implementation, or InMemory). Use when adding persistence for a new entity, adding a new query method, or writing the InMemory test double.
argument-hint: "Which repository or method are we building?"
---

# Repository

Read `docs/ai-rules/repository.md` for the full reference. Apply the rules below exactly.

---

## Step 1 — Define the interface

Path: `modules/[feature]/repository/[feature].repository.ts`

Rules:
- `create` receives the entity and returns the entity with the bank-assigned `id`.
- Single-record lookups return `Entity | null` — never throw.
- List methods return a **plain type** (e.g. `AuctionListItem[]`), never `Entity[]`.
- Auxiliary types (`FindAllOutput`, `AuctionListItem`) live in the same interface file.

```ts
export type AuctionListItem = { id: number; title: string; status: AuctionStatus; };
export type FindAllAuctionsOutput = { data: AuctionListItem[]; page: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean; };

export interface AuctionRepository {
  create(auction: Auction): Promise<Auction>;
  findById(id: number): Promise<Auction | null>;
  findAll(input: GetAllAuctions): Promise<FindAllAuctionsOutput>;
  update(auction: Auction, id: number): Promise<void>;
  delete(id: number): Promise<void>;
}
```

---

## Step 2 — Prisma implementation

Path: `modules/[feature]/repository/prisma/prisma-[feature].repository.ts`

Key rules:
- Map every Prisma result to an Entity before returning. Never expose raw Prisma objects.
- Use `entity.toPersistence()` as the input for `create` and `update`.
- Dependent queries use `$transaction`; independent queries use `Promise.all`.
- Use explicit `select` for reads that must exclude sensitive fields.
- Pagination: `take: limit + 1` to detect next page; run `count` in parallel with `findMany`.

```ts
async findById(id: number): Promise<Auction | null> {
  const row = await prisma.auction.findUnique({ where: { id }, include: { category: true } });
  if (!row) return null;
  return new Auction(row.id, row.title, row.status, ...);
}

async create(auction: Auction): Promise<Auction> {
  const row = await prisma.auction.create({ data: { ...auction.toPersistence() } });
  return new Auction(row.id, row.title, row.status, ...);
}
```

---

## Step 3 — InMemory implementation

Path: `modules/[feature]/repository/in-memory/in-memory-[feature].repository.ts`

Key rules:
- Public array for test inspection: `public auctions: Auction[] = []`
- `create`: generate id (`randomUUID()` or counter), return new entity instance with that id.
- `findById`: return `this.array.find(...) ?? null`
- `update`: find by index and replace.
- `delete`: filter the array.

```ts
export class InMemoryAuctionRepository implements AuctionRepository {
  public auctions: Auction[] = [];
  private nextId = 1;

  async create(auction: Auction): Promise<Auction> {
    const persisted = new Auction(this.nextId++, auction.title, auction.status, ...);
    this.auctions.push(persisted);
    return persisted;
  }

  async findById(id: number): Promise<Auction | null> {
    return this.auctions.find((a) => a.id === id) ?? null;
  }

  async update(auction: Auction, id: number): Promise<void> {
    const idx = this.auctions.findIndex((a) => a.id === id);
    this.auctions[idx] = auction;
  }

  async delete(id: number): Promise<void> {
    this.auctions = this.auctions.filter((a) => a.id !== id);
  }
}
```

---

## Step 4 — Verify checklist

- [ ] Interface uses only domain types (no Prisma types)
- [ ] `create` returns the entity with the persisted `id`
- [ ] List methods return a plain type, not `Entity[]`
- [ ] Prisma implementation maps all results to Entity before returning
- [ ] Dependent Prisma queries are wrapped in `$transaction`
- [ ] InMemory array is `public`
- [ ] InMemory `find*` methods return `null` (not `undefined`) when not found
- [ ] Repository never throws domain errors — it returns `null`
