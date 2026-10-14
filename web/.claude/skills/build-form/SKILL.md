---
name: build-form
description: "Use when creating or editing a form in this project. Covers the full stack: Zod schema, Server Action with safeParse, React Hook Form + zodResolver, field components, and error display. Triggers on: 'criar formulário', 'add form', 'build form', 'novo formulário', 'form de'."
user-invocable: true
---

# Formulários + Validação

## Padrão obrigatório

Todo formulário usa **React Hook Form + Zod**, sem exceção. Não existe formulário controlado com `useState` isolado.

```
Schema Zod (validação de formato)
  └── useForm + zodResolver (validação no cliente)
        └── onSubmit → Server Action
              └── safeParse (validação no servidor)
                    └── http → API
```

---

## Estrutura de arquivos

O schema Zod fica no mesmo diretório do formulário — não em `src/lib/types/`.

```
src/app/(auctioneers)/dashboard/leiloes/criar/
├── page.tsx
├── _components/
│   └── create-auction-form.tsx   ← formulário
├── create-auction-schema.ts      ← schema Zod colocado junto
└── actions.ts                    ← Server Action
```

---

## Padrão completo

### 1. Schema Zod

```ts
// create-auction-schema.ts
import { z } from "zod"

export const createAuctionSchema = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  startDate: z.string().datetime("Data de início inválida"),
  category: z.enum(["art", "jewelry", "vehicles"], {
    errorMap: () => ({ message: "Categoria inválida" })
  })
})

export type CreateAuctionSchema = z.infer<typeof createAuctionSchema>
```

### 2. Server Action com validação no servidor

```ts
// actions.ts
"use server"

import { http } from "@/lib/ky"
import { safeAction } from "@/lib/safe-action"
import { revalidateTag } from "next/cache"
import { createAuctionSchema, type CreateAuctionSchema } from "./create-auction-schema"

type Response = {
  code: number
  message: string
}

export async function createAuction(input: CreateAuctionSchema) {
  const parsed = createAuctionSchema.safeParse(input)

  if (!parsed.success) {
    return { code: 400, message: parsed.error.issues[0].message }
  }

  return safeAction("createAuction", async () => {
    const res = await http.post("auctions", { json: parsed.data })
    const data = await res.json<Response>()
    revalidateTag("auctions")
    return { code: res.status, message: data.message }
  })
}
```

### 3. Componente de formulário

```tsx
// _components/create-auction-form.tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Form } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { InputForm } from "@/components/input-form"
import { createAuctionSchema, type CreateAuctionSchema } from "../create-auction-schema"
import { createAuction } from "../actions"

export function CreateAuctionForm() {
  const form = useForm<CreateAuctionSchema>({
    resolver: zodResolver(createAuctionSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: "",
      category: "art"
    }
  })

  async function onSubmit(data: CreateAuctionSchema) {
    const result = await createAuction(data)

    if (result.code >= 400) {
      toast.error(result.message)
      return
    }

    toast.success(result.message)
    form.reset()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <InputForm
          name="title"
          control={form.control}
          label="Título"
          placeholder="Nome do leilão"
        />

        {/* outros campos */}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Criando..." : "Criar leilão"}
        </Button>
      </form>
    </Form>
  )
}
```

---

## Componentes de campo disponíveis

### `InputForm` — input de texto com ícone opcional

```tsx
import { InputForm } from "@/components/input-form"

<InputForm
  name="email"
  type="email"
  control={form.control}
  label="Email"
  description="Opcional — aparece abaixo do campo"
  placeholder="seu@email.com"
  icon={<MailIcon className="h-5 w-5 text-muted-foreground" />}
  scale="md"  // "sm" | "md" (padrão: "md")
/>
```

### Outros campos Shadcn/ui

Para campos que não são input de texto simples, usar `FormField` diretamente:

```tsx
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

<FormField
  control={form.control}
  name="category"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Categoria</FormLabel>
      <FormControl>
        <Select onValueChange={field.onChange} defaultValue={field.value}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="art">Arte</SelectItem>
            <SelectItem value="jewelry">Joias</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## Exibição de erros

### Erro de campo — automático via `FormMessage`

`FormMessage` exibe o erro do Zod automaticamente. Não exibir mensagens de erro do campo manualmente.

### Erro global do formulário (erro da API)

```tsx
async function onSubmit(data: Schema) {
  const result = await myAction(data)

  if (result.code >= 400) {
    form.setError("root", { message: result.message })
    return
  }
}

// No JSX:
{form.formState.errors.root?.message && (
  <Alert variant="destructive">
    <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
  </Alert>
)}
```

Usar `toast.error(result.message)` para erros que não precisam ficar visíveis no form (ex: erros de rede, erros 500).

---

## Regras de validação Zod

| Responsabilidade | Onde fica |
|---|---|
| Formato (email, min, max, regex) | Schema Zod |
| Relação entre campos (senha === confirmação) | `.refine()` no schema |
| Lógica de negócio (leilão ativo, permissão) | Server Action, após `safeParse` |
| Mensagem de erro de campo | Zod (em português) |
| Mensagem de erro da API | Vem da API, exibida via `result.message` |

### Tipos primitivos

```ts
z.string().email('Email inválido')
z.string().min(3).max(100)
z.number().int().positive()
z.boolean()
z.string().datetime()
z.enum(['art', 'jewelry'])
z.string().optional()
z.string().nullable()
z.string().default('pending')
```

### Arrays

```ts
z.array(z.string()).min(1, 'Pelo menos uma tag é obrigatória')
z.array(z.object({ id: z.string(), quantity: z.number().positive() })).max(10)
```

### Refine (relação entre campos)

```ts
z.object({
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword']
})
```

### Transform (sanitização)

```ts
z.string().email().transform(val => val.toLowerCase())
z.string().transform(val => val.trim())
```

### Update schemas (partial)

```ts
const updateSchema = createSchema.partial()
```

---

## Validações NÃO permitidas no Zod (usar na Server Action)

- Lógica de negócio: permissões, regras de domínio
- Acesso a banco de dados
- Verificações de estado: status de leilão, validade de token
- Integrações externas

---

## O que NÃO fazer

```tsx
// ❌ useState para controlar campo de formulário
const [email, setEmail] = useState("")

// ❌ validação manual com if/else no onSubmit
async function onSubmit() {
  if (!email) return toast.error("Email obrigatório")
}

// ❌ schema Zod em src/lib/types/
import { schema } from "@/lib/types/auction.types"

// ❌ Server Action sem safeParse no servidor
export async function createAuction(data: Schema) {
  await http.post("auctions", { json: data })
}

// ❌ mensagem de erro criada no frontend
if (result.code === 409) toast.error("Este email já existe")

// ❌ parse() que lança exceção em vez de safeParse()
const validated = schema.parse(data)

// ❌ form.handleSubmit sem Form wrapper
<form onSubmit={form.handleSubmit(onSubmit)}>
  {/* sem <Form {...form}> por fora */}
</form>
```

---

## Checklist antes de finalizar

- [ ] Schema Zod criado e colocado junto ao componente/action
- [ ] Server Action usa `safeParse()` (não `parse()`)
- [ ] Erros de validação retornam `code: 400`
- [ ] Mensagem de erro vem do schema Zod
- [ ] Client Component usa `zodResolver` com React Hook Form
- [ ] Tipos exportados com `z.infer<typeof schema>`
- [ ] Validações de formato/tipo no Zod
- [ ] Lógica de negócio na Server Action (não no schema)
- [ ] Transformações e sanitizações aplicadas quando necessário
