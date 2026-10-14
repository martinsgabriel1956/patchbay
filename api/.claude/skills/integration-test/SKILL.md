---
name: integration-test
description: Create or modify a route-level integration test. Use whenever the user asks to write, add, or update an integration test for a Route, wants to validate the real HTTP wiring (middlewares, CASL, Zod schema, Prisma), or is scaffolding a spec into the tests/integration/ + tests/factories/seed-* layout.
argument-hint: "Qual rota estamos testando?"
---

# Integration Test

---

## Step 1 — File location

`[module]/tests/integration/[name].route.integration.spec.ts` — **1 arquivo de rota de produção = 1 arquivo de teste = 1 `describe`**. Nunca um spec cobrindo várias rotas de um módulo (isso força describes aninhados e mistura setups diferentes num arquivo só).

```
src/modules/address/
  routes/reveal-user-address.route.ts
  tests/
    factories/seed-address.ts
    integration/reveal-user-address.route.integration.spec.ts
```

Nunca ao lado do arquivo de rota (`routes/`) — mesma regra do `unit-test` pra `tests/units/`.

---

## Step 2 — Infra compartilhada: nunca duplique, sempre reuse

Tudo em `src/shared/tests/integration/`:

| Arquivo | Responsabilidade |
|---|---|
| `global-setup.ts` | Sobe um Postgres efêmero via testcontainers, roda `prisma migrate deploy` uma vez antes de toda a suite, derruba o container no fim. Registrado como `globalSetup` no `vitest.integration.config.ts`. Nenhum teste toca no banco de dev. |
| `setup.ts` | Registrado como `setupFiles`. Mocka, **uma vez para toda a suite**: `@/config/env`, `@/shared/services/redis/UpstashRedis.service` (com `InMemoryRedisService`, exportado como `inMemoryRedis`), `bullmq` (`Queue`/`Worker` fake) e `@/config/redis-tcp`. Nunca repita esses `vi.mock` dentro de um spec. |
| `build-test-app.ts` | `buildTestApp()` monta a instância Fastify de teste **já com todas as rotas registradas** (`globalRoutes` sob `/api`, igual produção), além de `fastifyCookie`, `prismaPlugin` e `globalErrorHandler`. |
| `db-cleaner.ts` | `cleanDatabase()` — `TRUNCATE` em todas as tabelas (exceto `bidder_sequence`) entre cada teste. |
| `binary-parser.ts` | Parser de resposta binária pra testes de export/relatório (`supertest(...).buffer(true).parse(binaryParser)`). |
| `auth/` | Um helper por ator de autenticação (ver Step 5). |

**`buildTestApp()` já registra todas as rotas da aplicação (via `globalRoutes`, sob `/api`) — nunca chame `app.register(minhaRota, { prefix })` dentro de um spec.** É exatamente igual ao `app.ts` de produção (menos os plugins que exigem infraestrutura externa viva: `clerkPlugin`, `socketPlugin`, `bullMqWorkerPlugin`, `helmet`, `cors`, `jwt`, `multipart`, `swagger`, `metrics` — nenhum deles é necessário pra exercitar uma rota via `supertest`).

Por que `setup.ts` mocka `bullmq`/`redis-tcp` mesmo sem registrar o worker: `globalRoutes` importa toda a árvore de rotas, e várias factories (auction, items, bids, auto-bids, auctioneer) fazem `new BullMqBaseEventBus()`. Isso importa `BullMqBaseEventBus.ts`, que importa todos os handlers de evento, que importam os arquivos de fila (`item-queue.ts`, `auction-queue.ts`...), que fazem `new Queue(name, { connection: redisTCP })` **no topo do módulo** — puramente pelo grafo de import, antes de qualquer request. Sem o mock, isso abre uma conexão TCP real (e sem listener de erro registrado em `redisTCP`, pode até derrubar o processo).

Se uma rota precisa de Redis com estado limpo entre `it`s, importe `inMemoryRedis` de `setup.ts` e chame `inMemoryRedis.clear()` no `beforeEach`.

**Nunca** rode Redis real em container. `InMemoryRedisService` já é o double sancionado pelo projeto (ver `CLAUDE.md`: "Cache: UpstashRedisService em prod / InMemoryRedisService em tests") e implementa `IRedisService` por completo.

---

## Step 3 — Seed: factory por entidade, nunca inline, nunca global

Uma factory `seed-[entity].ts` por entidade, no módulo dono da entidade — persiste via Prisma direto, reusando o `make-[entity].ts` de unit test já existente (nunca duplique a geração de campos):

```ts
// src/modules/auth/tests/factories/seed-user.ts
import { prisma } from "@/config/db";
import { makeUser } from "./make-user";

export async function seedUser(overrides: Parameters<typeof makeUser>[0] = {}) {
	const user = await prisma.user.create({ data: makeUser(overrides) });
	return { user };
}
```

```ts
// src/modules/address/tests/factories/seed-address.ts
import { prisma } from "@/config/db";
import { makeAddress } from "./make-address";

export async function seedAddress(userId: string, overrides: Parameters<typeof makeAddress>[0] = {}) {
	const address = await prisma.address.create({
		data: makeAddress({ ...overrides, userId }).toPersistence()
	});
	return { address };
}
```

Compõe no próprio teste, entidade por entidade — não crie uma factory "seedUserWithAddress" que já faz as duas coisas, a menos que o par apareça junto em quase todo teste do módulo:

```ts
const { user } = await seedUser();
const { address } = await seedAddress(user.id, { street: "Rua das Flores" });
```

Se a entity não tem `make-[entity].ts` ainda, escreva os campos à mão na seed — mas prefira criar o `make-*` primeiro se a entity for reaproveitável em unit tests também.

**Nunca** rode `prisma/seed.ts` (o script de bootstrap de dev/demo) dentro do `global-setup.ts` pra popular uma fixture "compartilhada" entre specs. Esse script cria entidades com IDs e emails fixos pensados pra um ambiente de demonstração manual, não pra isolamento de teste — como o `db-cleaner.ts` já dá `TRUNCATE` em tudo antes de cada `it`, uma fixture "global" ou desaparece no primeiro teste ou exige excluir tabelas do truncate, o que revive exatamente o problema que o truncate existe pra evitar: estado mutável compartilhado entre arquivos. Cada spec semeia só o que precisa.

---

## Step 4 — Skeleton do arquivo

```ts
import { faker } from "@faker-js/faker";
import type { FastifyInstance } from "fastify";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/config/db";
import { seedUser } from "@/modules/auth/tests/factories/seed-user";
import { AUDIT_LOG_ACTION } from "@/shared/constants/audit-log";
import { createAndLoginAsSystemMember } from "@/shared/tests/integration/auth/login-as-system-member";
import { buildTestApp } from "@/shared/tests/integration/build-test-app";
import { cleanDatabase } from "@/shared/tests/integration/db-cleaner";
import { seedAddress } from "../factories/seed-address";

describe("RevealUserAddressRoute", () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = buildTestApp();
		await app.ready();
	});

	beforeEach(async () => {
		await cleanDatabase();
	});

	afterAll(async () => {
		await app.close();
	});

	it("should return 200 with the real address and record an audit log entry", async () => {
		const { cookie, member } = await createAndLoginAsSystemMember(app, { role: "SUPPORT" });
		const { user } = await seedUser();
		const { address } = await seedAddress(user.id, { street: "Rua das Flores" });

		const response = await supertest(app.server)
			.post(`/api/users/${user.id}/addresses/${address.id}/reveal`)
			.set("Cookie", cookie);

		expect(response.status).toBe(200);
	});
});
```

Note que **nenhuma rota é registrada dentro do teste** — `buildTestApp()` já sobe com `globalRoutes` completo. O `describe` usa o nome exportado do arquivo de rota em PascalCase (`RevealUserAddressRoute`, igual `revealUserAddressRoute` de `reveal-user-address.route.ts`) — nunca `"METHOD /path"`, pra ficar consistente com o `describe("NomeDoUseCase", ...)` do `unit-test`. Toda chamada `supertest`, por sua vez, usa o path real com `/api` na frente, igual o `app.ts`.

- **`beforeAll`** sobe o app uma vez por `describe`, nunca por `it`.
- **`beforeEach`** só chama `cleanDatabase()` (mais `inMemoryRedis.clear()` se a rota depender de Redis). Nada de estado compartilhado entre `it`s.
- **`afterAll`** fecha o app — sem isso a suíte deixa conexões abertas.

---

## Step 5 — Autenticação por ator

Cada ator do sistema tem seu próprio helper em `src/shared/tests/integration/auth/`, sempre fazendo o fluxo real (nunca assinando o token manualmente pra pular a validação). Como `buildTestApp()` já registra todas as rotas, basta chamar o helper direto — não precisa registrar nenhum barrel de auth antes:

| Ator | Transporte | Helper |
|---|---|---|
| System Member | Cookie (`SYSTEM_MEMBER_ACCESS_TOKEN_COOKIE`) | `login-as-system-member.ts` — `createAndLoginAsSystemMember(app, { role })`: semeia o membro (`seedSystemMember`), faz `POST /api/system-members/login` de verdade, devolve `{ member, cookie }` — use `.set("Cookie", cookie)` |
| Organization Member | Header `x-organization-member-token` + `Host` do subdomínio (tenant) | `login-as-organization-member.ts` — `createAndLoginAsOrganizationMember(app, organization, overrides?)`: recebe a `Organization` já semeada (não cria — veja abaixo), semeia o membro (`seedOrganizationMember`) vinculado a ela, faz `POST /api/organization/member/sessions` com `Host: {subDomain}.localhost`, devolve `{ member, token, host }` — use `.set("Host", host).set("x-organization-member-token", token)` **em toda requisição**, não só no login (qualquer rota com `authOrganization` também tem `requireTenant`, que resolve o tenant pelo `Host` a cada request) |
| Auctioneer | Header `x-auctioneer-token` | `login-as-auctioneer.ts` — `createAndLoginAsAuctioneer(app, { email?, isActive? })`: semeia o auctioneer (`seedAuctioneer`), faz `POST /api/auctioneer/login`, devolve `{ auctioneer, token }` — use `.set("x-auctioneer-token", token)` |
| User (usuário final, Clerk) | Sessão Clerk (`getAuth(req)` de `@clerk/fastify`) | `login-as-user.ts` — `createAndLoginAsUser(overrides?)`: semeia o usuário (`seedUser`) com um `clerkId` real e configura o retorno mockado de `getAuth` pra `{ isAuthenticated: true, userId: user.clerkId }`, devolve `{ user }` |

**Por que `createAndLoginAsUser` mocka em vez de logar de verdade:** Clerk é um provedor de identidade de terceiro — não tem "login real" possível num teste de integração, igual não tem pra Resend/S3 (`buildTestApp()` não registra `clerkPlugin` de propósito, pelo mesmo motivo). O limite testável de verdade é o `auth.middleware.ts`/`auth-organization.middleware.ts`-equivalente pra usuário final: ele resolve `getAuth(req)` (sessão Clerk) pro `User` interno via `clerkId`. O helper semeia um usuário real com `clerkId` e configura o retorno do `getAuth` mockado — não é um atalho, é a fronteira certa.

Por causa de como o `vi.mock` do Vitest é hoisted (só funciona se estiver escrito no próprio arquivo do spec, nunca dentro de uma função importada), toda rota que usa esse ator ainda precisa declarar, no topo do próprio spec:

```ts
vi.mock("@clerk/fastify", () => ({ getAuth: vi.fn() }));
```

antes de importar e chamar `createAndLoginAsUser(...)`. Isso não é "vazamento" da abstração — é o mínimo inevitável pra esse tipo de mock funcionar; o helper cuida do resto (seed + configurar o retorno).

O login (cookie via `Set-Cookie`) e a autenticação nas rotas protegidas (header) usam transportes diferentes pra Organization Member e Auctioneer — os helpers já leem o cookie da resposta do login e devolvem só o **valor do token**, pronto pra virar header nas próximas chamadas. Não confunda com o padrão do System Member, que usa cookie nos dois lados.

**Por que `createAndLoginAsOrganizationMember` recebe a `Organization` em vez de criar uma:** o nome já é honesto sobre fazer duas coisas — criar o membro e logar — igual `createAndLoginAsSystemMember`/`createAndLoginAsAuctioneer`. Mas o membro tem uma dependência que os outros dois atores não têm (precisa pertencer a uma organização), e essa dependência não é parte de "logar como membro" — é do teste decidir. Se o helper criasse a organização internamente, um teste que precisa de dois membros no mesmo tenant (ex: um `OWNER` e um `MANAGER` testando uma regra de permissão) teria que chamar o helper duas vezes e acabaria com duas organizações diferentes, sem jeito de reusar a primeira (o `subDomain` é único). Recebendo a organização por fora:

```ts
const { organization } = await seedOrganization();
const owner = await createAndLoginAsOrganizationMember(app, organization, { role: "OWNER" });
const manager = await createAndLoginAsOrganizationMember(app, organization, { role: "MANAGER" });
```

Se a rota exige uma permissão CASL (`config.permissions` no route), passe a `role` que você sabe, pelas regras em `src/config/permissions/ability/*/`, que **tem** ou **não tem** aquela permissão — não adivinhe.

---

## Step 6 — O que vale a pena testar (a maior carga já é do unit test)

Integration test aqui é uma casca fina — prova a fiação HTTP real (middleware, CASL, Zod, Prisma, mapeamento erro→status), não a regra de negócio. Antes de escrever qualquer `it`, abra o spec unitário do use case: tudo que ele já cobre não se repete aqui.

**Vale escrever:**
- **1 caminho feliz** que prova a cadeia completa (rota → controller → use case → repositório Prisma real → resposta), com o efeito colateral confirmado no banco real (não no repositório InMemory)
- **1 teste por status HTTP distinto** que a rota pode retornar — não por causa de negócio. Se duas regras diferentes do use case levam ao mesmo 404, isso já foi provado separadamente no unit test; o integration só confirma que aquele erro específico é mapeado pra aquele status via `globalErrorHandler`
- **401** quando o middleware de auth (`authSystemMember`, `authOrganization`, `requireAuctioneer`) realmente bloqueia a ausência/invalidade de credencial
- **403** quando a permissão CASL declarada na rota é realmente aplicada — só escreva esse teste se existir de fato uma `role` sem aquela permissão nas regras atuais (`src/config/permissions/ability/*/`). Se todas as roles do sistema têm a permissão exigida, esse branch é inatingível hoje — não invente um cenário fictício só para preencher a tabela.

**Não vale escrever** (redundante com o unit test, ou é genérico de framework):
- Múltiplas causas de negócio que levam ao mesmo status HTTP
- Validação de schema Zod em si (formato de UUID, string vazia, tamanho mínimo) — a menos que a rota tenha um `.refine()`/regra customizada que vale a pena confirmar que está de fato anexada à rota
- Granularidade de side-effect (todos os campos do audit log, edge cases de lógica pura como `userAgent` nulo) — o unit test já prova isso exaustivamente com InMemory
- Qualquer branch condicional do use case que não muda o status HTTP observável

---

## Step 7 — Nomenclatura dos `it()`

Mesmo padrão do `unit-test`: inglês, `should ...` / `should not ...`, descrevendo o comportamento HTTP observável.

```
should return 200 with the real address and record an audit log entry
should return 401 when no system-member access-token cookie is present
should return 404 when the address does not exist
```

---

## Step 8 — Como rodar

```bash
npm run test:integration
```

Só precisa do Docker rodando — sem criar banco manualmente, sem subir Redis. `global-setup.ts` cuida do Postgres efêmero.

---

## Step 9 — Verify checklist

- [ ] Spec em `[module]/tests/integration/[name].route.integration.spec.ts`, nunca ao lado do arquivo de rota
- [ ] 1 arquivo de rota de produção = 1 arquivo de teste = 1 `describe`, sem describes aninhados
- [ ] `describe` nomeado com o export da rota em PascalCase (`RevealUserAddressRoute`), nunca `"METHOD /path"`
- [ ] **Nenhum `app.register(rota, { prefix })` dentro do spec** — `buildTestApp()` já registra tudo via `globalRoutes`
- [ ] Nenhum `vi.mock` de `@/config/env`, `UpstashRedis.service`, `bullmq` ou `@/config/redis-tcp` dentro do spec — já vem de `setup.ts`
- [ ] Toda chamada `supertest` usa o path real com `/api` na frente (`/api/users/...`, `/api/system-members/...`)
- [ ] Seed via `[module]/tests/factories/seed-[entity].ts` (reaproveitando `make-[entity].ts` quando existir), nunca inline no spec, nunca via `prisma/seed.ts`
- [ ] `beforeAll` sobe o app uma vez, `beforeEach` chama `cleanDatabase()`, `afterAll` fecha o app
- [ ] Autenticação via helper de `shared/tests/integration/auth/`, fazendo o fluxo real (login/token), nunca assinando manualmente pra pular validação
- [ ] Exatamente 1 teste por status HTTP distinto que a rota pode retornar — sem repetir causas de negócio já cobertas no unit test
- [ ] Teste de 403 só existe se houver de fato uma role sem a permissão exigida
- [ ] Nenhuma validação de schema Zod genérica sendo testada sem motivo
- [ ] Todo `it()` nomeado em inglês, `should ...` / `should not ...`, descrevendo o comportamento HTTP observável
