---
name: unit-test
description: Create or modify a unit test (spec) for a Use Case, Entity, or Value Object. Use whenever the user asks to write, add, or update a test for one of these layers, wants full branch/line coverage, mentions edge cases, asks for a regression test after a bug is found, or is scaffolding/migrating a spec into the tests/units/ + tests/factories/ layout.
argument-hint: "Qual Use Case, Entity ou Value Object estamos testando?"
---

# Unit Test

---

## Escopo — o que testar

| Camada | Testa? | Onde |
|---|---|---|
| Use Case | Sim — obrigatório | `tests/units/use-cases/[name].use-case.spec.ts` |
| Entity | Sim — obrigatório | `tests/units/entities/[name].entity.spec.ts` |
| Value Object | Sim — obrigatório | `tests/units/entities/[Name].validator.spec.ts` |
| Repository Prisma | Não (coberto pelos testes de integração) | — |
| Repository InMemory | Não (é infraestrutura de teste) | — |
| Controller | Não (coberto pelos testes de integração) | — |
| Route (integração) | Sim — recomendado para fluxos críticos | skill `integration-test` |

**Ferramentas:** Vitest como runner; `@faker-js/faker` obrigatório pra qualquer dado sintético; repositórios em teste sempre InMemory, nunca Prisma; banco de dados nunca acessado em teste unitário (isso é responsabilidade do teste de integração — skill `integration-test`). Coverage mínimo de 99% sobre entities, use cases e value objects (`vitest.config.ts`) — abaixo disso o CI falha.

---

## Step 1 — File locations

`tests/units/` é subdividida por camada, espelhando as pastas de produção:

- Use Case: `modules/[feature]/tests/units/use-cases/[name].use-case.spec.ts`
- Entity / Value Object: `modules/[feature]/tests/units/entities/[name].entity.spec.ts` (ou `.validator.spec.ts`)
- Policy: `modules/[feature]/tests/units/policies/[name].policy.spec.ts`
- Service (classe injetada como dependência, não é use case/entity/policy — ex: `AuditLogger`, `AuctioneerNotificationService`): `modules/[feature]/tests/units/services/[name].spec.ts`
- Factory de entidade (estado do banco): `modules/[feature]/tests/factories/make-[name].ts`
- Factory de DTO (input do SUT): `modules/[feature]/tests/factories/make-[name]-dto.ts`
- Factory usada por specs de mais de um módulo (ex: `OrganizationContext`): `src/shared/tests/factories/make-[nome].ts`

Nunca defina uma função `make*` dentro do arquivo de spec, e nunca deixe o spec ao lado do arquivo fonte (`use-cases/`, `entities/`) — sempre em `tests/units/[camada]/`. Um campo novo na entity/schema só deve exigir editar a factory, não os N specs que a usam.

A subpasta é pela **camada do arquivo testado**, não pela pasta onde ele mora hoje — um service que vive na raiz do módulo (ex: `modules/audit-log/audit-logger.ts`, sem uma pasta `services/` própria) ainda vai em `tests/units/services/`, exatamente como um service que já mora em `modules/[feature]/services/`.

Antes de dar por encerrada a migração de um service, confira se o arquivo fonte está no `coverage.include` do `vitest.config.ts` — arquivos que vivem fora de `entities/**`, `use-cases/**`, `policies/**` (como um service solto na raiz do módulo) ficam fora do coverage do CI por padrão, mesmo com o teste passando. Adicione o caminho explícito se estiver faltando (ex: `"src/modules/audit-log/audit-logger.ts"`).

Import relativo pra dentro do próprio módulo (repository, use-case, entity) fica um nível mais profundo por causa da subpasta de camada — ex: de `tests/units/use-cases/` pro código fonte é `../../../use-cases/[name].use-case`, e pra uma factory é `../../factories/make-[name]`. Não crie um alias novo no `tsconfig.json` pra isso — `@/modules/[feature]/tests/...` e `@/shared/tests/...` já resolvem essas pastas hoje, só use import relativo dentro do mesmo módulo (convenção já seguida em todos os specs) e `@/...` pra referências de outro módulo.

---

## Step 2 — Duas categorias de factory: entidade e DTO

**Factory de entidade** abstrai o que já está "salvo" — usada pra popular um repositório InMemory antes do teste rodar:

```ts
// modules/auction/tests/factories/make-auction.ts
auctionRepository.auctions = [
  makeAuction({ id: 1, auctioneerId: AUCTIONEER_ID, status: "SCHEDULED" }),
  makeAuction({ id: 2, auctioneerId: AUCTIONEER_ID, status: "ACTIVE" }),
  makeAuction({ id: 3, auctioneerId: AUCTIONEER_ID, status: "ENDED" })
];
```

**Factory de DTO** abstrai o objeto que vai direto pro `sut.execute(...)` (o input de um use case, tipicamente o mesmo shape do body/query da rota):

```ts
// modules/auction/tests/factories/make-auction-dto.ts
import { faker } from "@faker-js/faker";
import type { CreateAuction } from "../../schema/create-auction.schema";

export function makeAuctionDto(overrides?: Partial<CreateAuction>): CreateAuction {
  return {
    title: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    categoryIds: [1],
    // ...demais campos com valores padrão válidos
    ...overrides,
  };
}
```

```ts
// no teste
sut.execute(makeAuctionDto({ categoryIds: [1, 999] }), "1", context);
```

Um campo novo na entity/DTO só deve exigir editar a factory correspondente, não os N specs que a usam — é aí que a factory paga seu preço. Se o tipo já tem uma factory (no módulo ou em `src/shared/tests/factories/`), reutilize — não duplique.

**Exceção:** quando o valor exato importa para a regra de negócio sendo testada (ex: garantir que um email específico é rejeitado, ou que um CEP mal formatado gera erro), use o literal diretamente no `it` — não esconda esse valor dentro do mock genérico da factory.

---

## Step 3 — Declare todas as dependências do SUT no topo do `describe`

```ts
describe("CreateAuctionDraftUseCase", () => {
  let auctionRepository: InMemoryAuctionRepository;
  let categoryRepository: InMemoryCategoryRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let organizationAuditLogRepository: InMemoryOrganizationAuditLogRepository;
  let eventBus: IEventBus;
  let sut: CreateAuctionDraftUseCase;

  const context = makeOrganizationContext();
  // ...
});
```

`sut` é sempre a última declaração — assim quem lê o arquivo vê primeiro do que ele depende, e só depois o próprio objeto sob teste. `context` (ou qualquer dado fixo entre todos os `it`s) é `const`, nunca `let` — não é reatribuído no `beforeEach`.

---

## Step 4 — `beforeEach` cria tudo do zero

```ts
beforeEach(() => {
  auctionRepository = new InMemoryAuctionRepository();
  categoryRepository = new InMemoryCategoryRepository();
  auditLogRepository = new InMemoryAuditLogRepository();
  organizationAuditLogRepository = new InMemoryOrganizationAuditLogRepository();
  eventBus = { publish: vi.fn() };

  sut = new CreateAuctionDraftUseCase(
    auctionRepository,
    categoryRepository,
    new AuditLogger(auditLogRepository, organizationAuditLogRepository),
    eventBus
  );
});
```

Nunca compartilhe instâncias entre `it`s. Um teste que passa por causa do estado deixado por outro teste é um teste que vai quebrar sozinho quando a ordem mudar.

---

## Step 5 — Mock integrações externas com `vi.mock`, nunca rode a implementação real

Um teste unitário testa o SUT, não as libs/serviços externos que ele usa por baixo. Se uma dependência encapsula algo que fala com o mundo real ou faz trabalho pesado (hash de senha, SDK de pagamento, storage/S3, geração de PDF, chamada HTTP externa), mocke o módulo inteiro com `vi.mock` — não deixe a implementação real rodar dentro do teste.

```ts
vi.mock("@/shared/utils/Hash", () => ({
  Hasher: {
    hash: vi.fn(async (password) => ({ hashPassword: `hashed-${password}`, salt: "test-salt" })),
    compare: vi.fn(async ({ candidate, storedHash }) => `hashed-${candidate}` === storedHash),
  },
}));
```

Como decidir o que mockar:
- Repository, cache, fila → sempre InMemory (já é uma classe isolada e testável, não precisa de `vi.mock`)
- Util/serviço que só encapsula uma lib/API externa (hash, gateway de pagamento, storage, PDF) → `vi.mock` do módulo inteiro

Rodar a implementação real de hash (bcrypt, argon2) ou qualquer lib de I/O dentro de um teste unitário deixa a suite lenta e testa uma camada que não é responsabilidade desse spec — isso é testes de integração.

---

## Step 6 — Nomeie o `it()` sempre em inglês, no padrão "should ..."

```
should [comportamento esperado] [quando/se condição]
should throw [Erro] when [condição]
should not [comportamento] when [condição]
should not [comportamento do bug] (regression)
```

Exemplos:
- `"should create an auction"`
- `"should throw NotFoundError when one or more categories are not found"`
- `"should not save audit log when category is not found"`

Nunca escreva o título em português, nunca use descrições vagas tipo `"it works"` ou `"caso de erro"` — o nome sozinho, sem abrir o teste, tem que dizer qual comportamento está sendo garantido.

---

## Step 7 — Todo `vi.fn()` precisa de um `expect` que prove a chamada

Criar `eventBus = { publish: vi.fn() }` só resolve o TypeScript do construtor — não prova nada sobre o comportamento do SUT. Se o SUT deveria disparar aquele side-effect, o teste precisa afirmar isso explicitamente:

```ts
it("should publish an auction.created event", async () => {
  const auction = await sut.execute(makeAuctionDto(), "1", context);

  expect(eventBus.publish).toHaveBeenCalledWith({
    type: "auction.created",
    payload: expect.objectContaining({ id: auction.id })
  });
});
```

E o caminho onde o side-effect **não** deveria acontecer importa tanto quanto o caminho feliz — é fácil um bug fazer o evento disparar mesmo quando a operação falhou:

```ts
it("should not publish an event when category is not found", async () => {
  await expect(sut.execute({ ...makeAuctionDto(), categoryIds: [999] }, "1", context)).rejects.toThrow();

  expect(eventBus.publish).not.toHaveBeenCalled();
});
```

Mesma lógica vale para qualquer `vi.fn()`/`vi.mock` do Step 5 (ex: `Hasher.hash`, `mailerService.send`): se ele existe na dependência, algum `it` do arquivo tem que afirmar se foi chamado, com quê, e quantas vezes — ou não chamado.

---

## Step 8 — Cobertura: todo branch do SUT precisa de um `it`

Abra o arquivo do SUT e liste manualmente cada `if`, early return e `throw`. Cada um precisa de pelo menos um teste que force aquele caminho. Não confie só no número de coverage reportado pela ferramenta — 100% de linha não implica 100% de branch (um `if (a || b)` cobre a linha inteira mesmo testando só um dos dois lados como verdadeiro).

Ao terminar, confira:
- [ ] Caminho feliz
- [ ] Cada erro que o SUT pode lançar (`NotFoundError`, `ForbiddenError`, `BadRequestError`, etc.)
- [ ] Cada branch condicional (`if`, `?:`, `&&`, `||`) nos dois sentidos
- [ ] Loops e listas: vazia, um item, múltiplos itens

---

## Step 9 — Vá além do coverage: edge cases e bugs reais

Coverage garante que a linha rodou, não que o comportamento está certo. Depois de bater 100% de branch, pense ativamente em como quebrar o SUT — é aqui que bugs de verdade aparecem:

- Valores de fronteira (`0`, negativo, string vazia, array vazio, exatamente no limite de um `MAX_*`)
- Entradas duplicadas ou repetidas (ex: `categoryIds: [1, 1]`)
- Múltiplas chamadas no mesmo teste que dependem de estado mutado entre elas
- Estado que o repositório InMemory permite montar mas o Prisma jamais permitiria (útil para achar validações que faltam no use case)

Se um teste desses falhar, o bug é no SUT, não no teste — vá corrigir o SUT, não ajustar a expectativa do teste pra passar.

---

## Step 10 — Todo bug encontrado vira teste de regressão

Ao achar um bug real no Step 9 (o teste falhou por causa do SUT):

1. Corrija o SUT.
2. Mantenha o teste que expôs o bug no arquivo — não delete depois do fix.
3. Nomeie deixando claro que é regressão: `"should not [comportamento do bug] (regression)"`.

Isso impede que o mesmo bug volte silenciosamente numa refatoração futura sem que ninguém perceba.

---

## Step 11 — Teste comportamento, não implementação (Use Case)

O teste verifica o que o Use Case **faz** — o estado resultante, os erros lançados, os efeitos colaterais — nunca **como** ele faz internamente.

**Verifique estado via o array público do repositório InMemory:**

```ts
it("should create an address for a user", async () => {
  await sut.execute("user-1", makeAddressData());

  expect(addressRepository.addresses).toHaveLength(1);
});
```

**Cada `it` testa uma única regra ou comportamento.** Se precisa de mais de um `expect` pra provar coisas distintas, considere quebrá-lo em dois `it`s.

**Contexto (`ipAddress`, `userAgent`, `author`) usa valores fixos**, numa constante no topo do arquivo — nunca gerado por faker, já que o valor em si não é o que está sob teste:

```ts
const context: Context = {
  ipAddress: "192.168.0.1",
  userAgent: "Vitest",
  author: "user-1",
};
```

---

## Step 12 — Testes de Entity

Testes de entity não usam repositórios nem serviços — apenas instanciam a entity e verificam o resultado.

**Cubra:**
- Criação válida com campos obrigatórios
- Criação com campos opcionais (nulos, ausentes)
- Valores normalizados (trim, lowercase)
- Todos os erros que `static create()` pode lançar
- Transições de estado válidas e inválidas
- `toPersistence()` retorna os campos corretos

```ts
it("should not be able to create with fullName shorter than 3 characters", () => {
  expect(() =>
    Auctioneer.create("john@example.com", "Jo", null, null, "hash", "salt")
  ).toThrow(new BadRequestError("Full name must be at least 3 characters long."));
});

it("should return correct data from toPersistence", () => {
  const auctioneer = Auctioneer.create(...);
  const persistence = auctioneer.toPersistence();

  expect(persistence.passwordHash).toBe("hash");
  expect(persistence.isVerified).toBe(false);
});
```

---

## Step 13 — Testes de Value Object

Use `it.each` para cobrir múltiplos valores válidos e inválidos sem repetir estrutura:

```ts
it.each(["PASSWORD!strong", "JGKDksow!strong"])(
  "should accept valid password",
  async (password) => {
    const result = await Password.validate(password);
    expect(result.value).toBe(password);
  }
);

it.each(["", "PAssword", "password", "Pasw!"])(
  "should throw for invalid password",
  async (password) => {
    await expect(() => Password.validate(password)).rejects.toBeInstanceOf(BadRequestError);
  }
);
```

---

## Step 14 — Verify checklist

- [ ] Spec em `[module]/tests/units/`, nunca ao lado do arquivo fonte (`use-cases/`, `entities/`)
- [ ] Entidades usadas pra popular repositórios vêm de `make-[name].ts` em `[module]/tests/factories/` (ou `src/shared/tests/factories/` se usada por 2+ módulos), nunca de `new Entity(...)` inline no spec
- [ ] DTOs passados pro `sut.execute(...)` vêm de `make-[name]-dto.ts` em `[module]/tests/factories/`, nunca definidos inline no spec ou reimplementados por arquivo
- [ ] Todas as dependências do SUT declaradas como `let` no topo do `describe`, `sut` por último
- [ ] `beforeEach` recria todas as dependências e o `sut` — nada compartilhado entre `it`s
- [ ] Integrações externas (hash, SDKs, storage, PDF) mockadas via `vi.mock`, nunca a implementação real rodando no teste unitário
- [ ] Todo `it()` nomeado em inglês, no padrão `should ...` / `should not ...`
- [ ] Todo `vi.fn()`/`vi.mock` tem pelo menos um `expect` que afirma se foi chamado (ou não) e com quê
- [ ] 100% dos branches do SUT cobertos (não só 100% de linha)
- [ ] Edge cases fora do que o coverage report exige foram pensados e testados (limites, duplicatas, estado inconsistente)
- [ ] Todo bug encontrado durante a escrita dos testes tem um teste de regressão que permanece após o fix
- [ ] Use Case: estado verificado via array público do repositório InMemory, nunca inspecionando implementação interna
- [ ] Entity: cobre criação válida, campos opcionais, valores normalizados, todos os erros de `create()`, transições de estado e `toPersistence()`
- [ ] Value Object: usa `it.each` pra valores válidos e inválidos, sem repetir estrutura por valor
