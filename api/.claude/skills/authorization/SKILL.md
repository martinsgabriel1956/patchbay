---
name: authorization
description: Define ou revisa autenticação/autorização de uma rota. Use quando a rota precisa identificar quem está chamando (leiloeiro, membro de organização ou membro do sistema) e/ou restringir a ação via CASL. Nunca faça essa verificação no Use Case.
argument-hint: "Qual rota e qual ator (auctioneer, organization member, system member) estão envolvidos?"
---

# Authorization

Leia `docs/ai-rules/security.md` (seção "Autorização") e `docs/ai-rules/dont-do.md` antes de aplicar. As regras abaixo são restrições, não sugestões.

---

## Regra central

**Autorização é responsabilidade exclusiva do middleware, registrado na Route.**
Controller, UseCase, Entity e Repository nunca verificam token, sessão, `isActive` ou `ability`. Se você está prestes a checar permissão dentro de um Use Case, pare — a verificação já deveria ter acontecido no middleware, via `config.permissions` na Route.

**Não misture contextos de autenticação na mesma rota.**
Cada rota pertence a exatamente um ator: leiloeiro, membro de organização ou membro do sistema. Nunca registre mais de um dos três middlewares abaixo na mesma rota.

---

## Step 1 — Escolha o middleware pelo ator

| Middleware | Arquivo | Ator | Credencial | Popula |
|---|---|---|---|---|
| `authAuctioneer` | `src/shared/middlewares/auth-auctioneer.middleware.ts` | Leiloeiro | Header `x-auctioneer-token` | `request.authAuctioneerId` |
| `authOrganization` | `src/shared/middlewares/auth-organization.middleware.ts` | Membro de organização | Header `x-organization-member-token` | `request.authOrganizationMember`, CASL `ability` |
| `authSystemMember` | `src/shared/middlewares/auth-system-member.middleware.ts` | Membro do sistema (admin interno) | Cookie `SYSTEM_MEMBER_ACCESS_TOKEN_COOKIE` | `request.authSystemMemberId`, CASL `ability` |

`authOrganization` depende de `request.tenant` — sempre registre `requireTenant` antes dele em rotas de organização.

---

## Step 2 — Registre o middleware na Route (não no Controller, não no Use Case)

```ts
export async function updateAuctioneerRoute(app: FastifyInstance) {
	const controller = new UpdateAuctioneerController(useCase);

	app.register(authAuctioneer);

	app.patch("/", { schema: { ... } }, controller.handle.bind(controller));
}
```

Para rotas de organização, `requireTenant` vem antes:

```ts
app.register(requireTenant);
app.register(authOrganization);
```

---

## Step 3 — CASL via `config.permissions` (apenas `authOrganization` e `authSystemMember`)

`authAuctioneer` não usa CASL — não tem conceito de `role`/`ability`. Apenas `authOrganization` e `authSystemMember` suportam `config.permissions`; o próprio middleware lê `request.routeOptions.config.permissions` e lança `ForbiddenError` se `ability.can(action, subject)` for falso.

```ts
app.patch(
	"/",
	{
		config: {
			permissions: { action: "update", subject: "OrganizationSettings" }
		},
		schema: { ... }
	},
	controller.handle.bind(controller)
);
```

Omita `config.permissions` apenas quando qualquer membro autenticado (independente de `role`) pode acessar a rota. `action` e `subject` devem corresponder às regras definidas em `defineAbilityForOrganization` / `defineAbilityForSystemMember` (`src/config/permissions/ability/`) — não invente combinações fora do que a ability define.

---

## Step 4 — Nunca reimplemente a checagem no Use Case

O Use Case recebe o `authOrganizationMemberId`/`authAuctioneerId`/`authSystemMemberId` já validado (via Controller → Context) apenas para uso em regra de negócio (ex: dono do recurso, autor do audit log) — nunca para decidir se a ação é permitida. Se uma regra de autorização não é expressável via CASL (`action`/`subject`), isso é sinal de que a ability precisa de um novo caso, não de um `if` no Use Case.

---

## Step 5 — Verifique checklist

- [ ] Exatamente um dos três middlewares de auth registrado na rota (nunca mais de um)
- [ ] `requireTenant` registrado antes de `authOrganization` em rotas de organização
- [ ] `config.permissions` presente quando a ação exige `role` específico (org/system member)
- [ ] `action`/`subject` existem na `defineAbilityFor...` correspondente
- [ ] Nenhuma verificação de token, `isActive` ou `ability` fora do middleware
- [ ] Nenhum `if` de autorização dentro do Use Case, Controller ou Repository
