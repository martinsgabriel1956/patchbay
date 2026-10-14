---
name: auth-patterns
description: "Use when working with authentication, protected routes, session tokens, middleware, or user identity in this project. Covers the three auth contexts (public user via Clerk, auctioneer, org member). Triggers on: 'auth', 'autenticação', 'login', 'session', 'middleware', 'token', 'leiloeiro', 'membro', 'proteger rota'."
user-invocable: true
---

# Autenticação por Contexto

Este projeto tem três sistemas de autenticação independentes. Usar o token errado no contexto errado resulta em 401 ou acesso negado silencioso.

---

## Os três contextos

| Contexto | Quem é | Token | Cookie | Rota |
|---|---|---|---|---|
| Usuário público | Comprador, visitante | JWT via Clerk | gerenciado pelo Clerk | `(public)`, `(private)`, `(auth)` |
| Leiloeiro | Criador de leilões | Cookie HTTP-only próprio | `__next_ac_leil` (dev) / `__Secure-next_ac_leil` (prod) | `(auctioneers)/` |
| Membro de organização | Funcionário de organização | Cookie HTTP-only próprio | `__next_mac` (dev) / `__Secure-next_mac` (prod) | `organization/[slug]/` |

---

## Como o `http` injeta os tokens automaticamente

O cliente HTTP em `src/lib/ky.ts` lê os cookies do servidor e injeta os headers corretos em **toda** requisição:

```ts
// Usuário público — Clerk
const { getToken } = await auth()
const clerkToken = await getToken()
request.headers.set("Authorization", `Bearer ${clerkToken}`)

// Leiloeiro
const auctioneerToken = cookies.get(AUCTIONEER_ACCESS_TOKEN)?.value
request.headers.set("X-Auctioneer-Token", auctioneerToken)

// Membro de organização
const memberToken = cookies.get(ORGANIZATION_MEMBER_ACCESS_TOKEN)?.value
request.headers.set("X-Organization-Member-Token", memberToken)
```

Não é necessário injetar tokens manualmente nas Server Actions. O `http` faz isso.

---

## Proteção de rotas — middleware

O middleware em `src/lib/proxy/` protege as rotas verificando o token correto para cada contexto:

```
src/lib/proxy/
├── clerk-auth.ts              ← protege rotas (private) com Clerk
├── auctioneer-auth.ts         ← protege /auctioneers/* com token de leiloeiro
├── organization-member-auth.ts ← protege /organization/[slug]/platform/* com token de membro
├── organization-slug.ts       ← resolve o slug do tenant a partir do host
└── organization-tenant.ts     ← rewrite de rota para multi-tenancy
```

**Não adicionar lógica de autenticação fora desses arquivos.**

> O middleware proxy é o caminho primário para navegações de página. Para 401s que acontecem em runtime entre navegações (ex: membro desativado pelo admin enquanto está logado), o `safeAction` (`src/lib/safe-action.ts`) atua como defesa em profundidade: com `{ redirectOnUnauthorized: true }`, ele infere o contexto pela URL da request que falhou e redireciona para o route handler de logout correspondente:
>
> - `organization/member/*` → `/api/auth/logout/platform`
> - `auctioneer/*` → `/api/auth/logout/auctioneer`
> - demais → `/api/auth/logout` (Clerk)
>
> Cada route handler é fino — apenas chama a Server Action de logout do contexto (`logoutOrganizationMember`, `logoutAuctioneer`) ou, no caso Clerk, revoga a sessão via `clerkClient`. Essa indireção é necessária porque `safeAction` pode ser invocado durante render de Server Component, onde `cookies()` é read-only — route handlers têm permissão de write.

---

## Fluxo de autenticação por contexto

### Usuário público (Clerk)

```
1. Usuário acessa rota (private)
2. Middleware verifica sessão Clerk
3. Se não autenticado → redirect para /sign-in
4. Clerk injeta token JWT automaticamente no http
```

### Leiloeiro

```
1. Leiloeiro acessa /auctioneers/*
2. Middleware verifica __next_ac_leil cookie
3. Se expirado → tenta refresh com __none_rf cookie
4. Se refresh falhou → redirect para /auth/auctioneers/login + limpa cookies
5. Se válido → http injeta X-Auctioneer-Token em toda requisição
```

### Membro de organização

```
1. Membro acessa /organization/[slug]/platform/*
2. Middleware verifica __next_mac cookie
3. Se expirado → tenta refresh com __none_mrf cookie
4. Se refresh falhou → redirect para /platform/login + limpa cookies
5. Se válido → http injeta X-Organization-Member-Token em toda requisição
```

---

## Server Actions por contexto

As Server Actions não precisam saber qual contexto está ativo — o `http` injeta os tokens de todos os contextos presentes. A API backend decide qual token validar com base nos headers recebidos.

```ts
// Esta action funciona para qualquer contexto autenticado
export async function getProfile() {
  return safeAction("getProfile", async () => {
    const res = await http.get("profile")
    const data = await res.json<Profile>()
    return { code: res.status, data }
  })
}
```

---

## Acessar dados do usuário autenticado

### Usuário público (Clerk)

```ts
"use server"

import { auth, currentUser } from "@clerk/nextjs/server"

export async function getMyProfile() {
  const { userId } = await auth()

  if (!userId) {
    return { code: 401, message: "Não autenticado" }
  }

  const user = await currentUser()
  return { code: 200, data: user }
}
```

### Leiloeiro / Membro de organização

O ID do usuário vem do token validado no backend — não há equivalente ao `auth()` do Clerk para esses contextos. A identidade é estabelecida pelo token nos cookies, que o backend decoda.

```ts
// O backend identifica o leiloeiro pelo X-Auctioneer-Token
export async function getAuctioneerDashboard() {
  return safeAction("getAuctioneerDashboard", async () => {
    const res = await http.get("auctioneer/dashboard")
    const data = await res.json<Dashboard>()
    return { code: res.status, data }
  })
}
```

---

## O que NÃO fazer

```ts
// ❌ Acessar cookie de token diretamente em uma action
import { cookies } from "next/headers"

export async function getAuctioneerData() {
  const token = (await cookies()).get("__next_ac_leil")?.value
  const res = await fetch("...", {
    headers: { "X-Auctioneer-Token": token }  // http já faz isso
  })
}

// ❌ Verificar autenticação em Client Component
"use client"
export function ProtectedSection({ user }) {
  if (!user) return null  // autorização no cliente é insegura
  return <AdminContent />
}

// ❌ Adicionar lógica de refresh de token fora do middleware
export async function myAction() {
  // Não fazer refresh de token aqui — é responsabilidade do middleware
}

// ❌ Criar nova instância de ky com token manual
const authedKy = ky.create({
  headers: { "X-Auctioneer-Token": token }  // cria instância sem os outros headers
})
```
