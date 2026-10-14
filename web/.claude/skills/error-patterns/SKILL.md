---
name: error-patterns
description: "Use when implementing error handling or error display in this project. Covers safeAction wrapper, HTTP error codes, toast vs form.setError, not-found.tsx, error.tsx, and redirect patterns. Triggers on: 'error handling', 'tratamento de erro', 'safeAction', 'toast error', 'not-found', 'error.tsx', 'exibir erro'."
user-invocable: true
---

# Tratamento e Exibição de Erros

**A API é a fonte de verdade para mensagens de erro.** O frontend nunca cria mensagens — apenas exibe `result.message` que vem da API ou do Zod.

---

## Regras Fundamentais

**SEMPRE:**
- Use `safeAction` como wrapper em todas as Server Actions
- Importe o cliente HTTP como `http` de `@/lib/ky`
- Verifique erros com `result.code >= 400`
- Use `result.message` da API diretamente ao usuário

**NUNCA:**
- Use `if (!result.ok)` manualmente — o `safeAction` trata isso
- Retorne `{ httpStatus, message, data }` manualmente
- Crie mensagens de erro no frontend
- Use `try/catch` em Server Actions
- Use `ky` como named export — sempre `http`

---

## Como `safeAction` funciona

O `safeAction` (`src/lib/safe-action.ts`) é o wrapper obrigatório para toda comunicação HTTP em Server Actions:

- Captura `HTTPError` automaticamente e retorna `{ code, message }`
- Trata casos especiais: 401 faz logout, 403 + "Email not verified." redireciona para `/verify-email`
- Passa erros de redirect (`NEXT_REDIRECT`) sem interceptar
- Retorna `{ code: 500, message: "..." }` para erros inesperados

**Em caso de erro** → `{ code: number, message: string }`
**Em caso de sucesso** → o que o callback retornar

---

## Padrões de Server Action

### POST / PUT (Criar / Atualizar)

```ts
'use server'

import { http } from '@/lib/ky'
import { revalidateTag } from 'next/cache'
import { safeAction } from '@/lib/safe-action'

export async function createAction(input: CreateInput) {
  return safeAction('createAction', async () => {
    const response = await http.post('endpoint', { json: input })
    const data = await response.json<CreateResponse>()
    revalidateTag('cache-tag')
    return { data, code: response.status }
  })
}
```

### GET (Buscar)

```ts
'use server'

import { http } from '@/lib/ky'
import { safeAction } from '@/lib/safe-action'
import { cache } from 'react'

export const getAction = cache(async () => {
  return safeAction('getAction', async () => {
    const response = await http.get('endpoint', {
      next: { tags: ['cache-tag'] },
    })
    const data = await response.json<MyResponse>()
    return { data, code: response.status }
  })
})
```

### DELETE

```ts
'use server'

import { http } from '@/lib/ky'
import { revalidateTag } from 'next/cache'
import { safeAction } from '@/lib/safe-action'

export async function deleteAction(id: string) {
  return safeAction('deleteAction', async () => {
    const response = await http.delete(`endpoint/${id}`)
    revalidateTag('cache-tag')
    return { code: response.status }
  })
}
```

---

## Exibir erros no Client Component

### Em formulários — `form.setError("root")`

Para erros que vêm da API e se referem ao formulário como um todo (credenciais inválidas, conflito):

```tsx
async function onSubmit(data: Schema) {
  const result = await loginAction(data)

  if (result.code >= 400) {
    form.setError("root", { message: result.message })
    return
  }

  router.push("/dashboard")
}

// No JSX:
{form.formState.errors.root?.message && (
  <Alert variant="destructive">
    <AlertCircleIcon />
    <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
  </Alert>
)}
```

### Fora de formulários — toast

```tsx
"use client"

import { toast } from "sonner"
import { deleteAuction } from "./actions"

export function DeleteButton({ id }: { id: string }) {
  async function handleDelete() {
    const result = await deleteAuction(id)

    if (result.code >= 400) {
      toast.error(result.message)
      return
    }

    toast.success(result.message)
  }

  return <button onClick={handleDelete}>Deletar</button>
}
```

---

## Exibir erros em Server Components

### `not-found.tsx` — recurso não encontrado (404)

```tsx
// No page.tsx:
import { notFound } from "next/navigation"

export default async function AuctionPage({ params }) {
  const result = await getAuctionById(params.id)
  if (result.code === 404) notFound()
}
```

### `error.tsx` — erro recuperável

```tsx
// No page.tsx:
if (result.code >= 500) throw new Error(result.message)
```

### Quando usar cada um

| Situação | Como exibir |
|---|---|
| Recurso não existe (404) | `notFound()` → `not-found.tsx` |
| Erro de servidor (500) | `throw new Error()` → `error.tsx` |
| Erro de permissão (401/403) | `redirect("/auth/login")` ou `redirect("/unauthorized")` |
| Dado vazio mas não é erro | Renderizar estado vazio no componente |

---

## Redirecionamento em erros de autenticação

```tsx
import { redirect } from "next/navigation"

export default async function PrivatePage() {
  const result = await getPrivateData()

  if (result.code === 401) redirect("/auth/login")
  if (result.code === 403) redirect("/unauthorized")
}
```

---

## Erros HTTP comuns

| Status | Cenário | Ação no Cliente |
|--------|---------|-----------------|
| 400 | Requisição inválida | `toast.error(result.message)` |
| 401 | Não autenticado | `safeAction` faz logout automaticamente |
| 403 | Sem permissão | `toast.error(result.message)` |
| 404 | Não encontrado | `toast.error(result.message)` |
| 409 | Conflito | `toast.error(result.message)` |
| 500 | Erro do servidor | `toast.error(result.message)` |

---

## O que NÃO fazer

```ts
// ❌ if (!result.ok) manual — safeAction já captura HTTPError
if (!result.ok) {
  const error = await result.json()
  return { httpStatus: error.httpStatus, message: error.message }
}

// ❌ Envelope { httpStatus, message, data } manual
return { httpStatus: response.httpStatus, message: response.message, data: response.data }

// ❌ Mensagem de erro criada no frontend
if (result.code === 404) toast.error("Leilão não encontrado")
if (result.code === 409) toast.error("Email já cadastrado")
// ✅ CORRETO
toast.error(result.message)

// ❌ try/catch em Server Action
try {
  const response = await http.post('endpoint')
} catch (error) {
  return { httpStatus: 500, message: 'Erro genérico' }
}

// ❌ import { ky } de @/lib/ky
// ✅ import { http } de @/lib/ky

// ❌ Checar result.code === 200 (frágil)
if (result.code === 200) toast.success(result.message)
// ✅ CORRETO — qualquer 2xx é sucesso
if (result.code >= 400) { toast.error(result.message); return }
toast.success(result.message)

// ❌ Modificar a mensagem da API
toast.error(`Erro: ${result.message}`)
toast.error(result.message.toLowerCase())
```

---

## Checklist de Tratamento de Erros

- [ ] Server Action usa `safeAction` como wrapper
- [ ] HTTP client importado como `http` de `@/lib/ky`
- [ ] Sem `if (!result.ok)` manual
- [ ] Sem envelope `{ httpStatus, message, data }` manual
- [ ] Client Component verifica `result.code >= 400`
- [ ] Client Component usa `result.message` da API (nunca cria mensagem própria)
- [ ] Sem `try/catch` na Server Action
