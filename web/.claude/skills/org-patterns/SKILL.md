---
name: org-patterns
description: "Use when working with organization/tenant-specific features: subdomain routing, dynamic theming, org layout, org-scoped Server Actions, or variant pages. Triggers on: 'organização', 'organization', 'tenant', 'org slug', 'subdomínio', 'tema dinâmico', 'primaryColor', 'variant', 'elegant', 'luxurious', 'prestige'."
user-invocable: true
---

# Multi-tenancy — Organização

## Como funciona

Cada organização tem seu próprio subdomínio ou domínio customizado. O middleware resolve o slug da organização a partir do host e reescreve a URL para `organization/[slug]/*`.

```
minha-org.ileiloes.com.br/catalogo
  └── middleware detecta subdomínio "minha-org"
        └── rewrite para /organization/minha-org/catalogo
              └── src/app/organization/[slug]/(public)/catalogo/page.tsx
```

Domínios customizados também são suportados: o middleware chama a API para resolver o slug a partir do domínio.

---

## Estrutura de rotas da organização

```
src/app/organization/[slug]/
├── layout.tsx                      ← carrega settings da org, aplica tema
│
├── (public)/                       ← rotas públicas da org (visitantes)
│   ├── layout.tsx
│   ├── page.tsx                    ← home da org (variants: elegant, luxurious, prestige)
│   ├── catalogo/
│   ├── leilao/[id]/
│   └── auth/                       ← login/registro Clerk no contexto da org
│
└── (private)/
    └── platform/
        ├── (auth)/
        │   └── login/              ← login do membro de organização
        └── (admin)/                ← dashboard administrativo (protegido por token de membro)
            ├── layout.tsx
            └── page.tsx
```

---

## Tema dinâmico por organização

Cada organização tem `primaryColor` e `secondaryColor` configurados na API. O layout raiz da org aplica esses valores como CSS variables.

```tsx
// src/app/organization/[slug]/layout.tsx
export default async function OrganizationLayout({ params, children }: Props) {
  const { slug } = await params
  const { data } = await getOrganizationSettings(slug)

  if (!data) return notFound()

  return (
    <div
      className="org-theme min-h-screen"
      style={
        {
          "--primary": data.settings?.primaryColor,
          "--secondary": data.settings?.secondaryColor
        } as React.CSSProperties
      }
    >
      <OrgThemeProvider
        primaryColor={data.settings?.primaryColor}
        secondaryColor={data.settings?.secondaryColor}
      />
      {children}
    </div>
  )
}
```

### Variáveis de tema disponíveis

| Variável CSS | Uso |
|---|---|
| `--primary` | Cor principal da organização |
| `--secondary` | Cor secundária |
| `--accent` | Acento (igual ao primary por padrão) |
| `--popover` | Background de popovers (fixo: `#ffffff`) |
| `--card` | Background de cards (fixo: `#f5f5f5`) |

Usar sempre as classes Tailwind que referenciam essas variáveis — nunca hardcodar cores dentro de componentes da org.

```tsx
// ✅ CORRETO
<button className="bg-primary text-primary-foreground">Dar lance</button>

// ❌ ERRADO
<button className="bg-blue-600 text-white">Dar lance</button>
<button style={{ backgroundColor: "#0066cc" }}>Dar lance</button>
```

---

## Variantes de layout (landing page)

A home de cada organização suporta variantes visuais: `elegant`, `luxurious`, `prestige`. A variante é definida nas configurações da organização.

```
src/app/organization/[slug]/(public)/_components/variants/
├── elegant/
├── luxurious/
└── prestige/
```

**Não criar nova variante sem alinhamento com o time.** Modificar componentes de uma variante não afeta as outras.

---

## Acessar o slug da organização em Server Components

```tsx
type Props = {
  params: Promise<{ slug: string }>
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const result = await getOrganizationData(slug)
}
```

---

## Roteamento dentro da organização

```tsx
// ✅ CORRETO — link absoluto incluindo o slug
<Link href={`/organization/${slug}/catalogo`}>Catálogo</Link>

// Para domínio customizado (sem slug na URL visível):
<Link href="/catalogo">Catálogo</Link>
```

Navegação programática:

```tsx
"use client"

import { useRouter, useParams } from "next/navigation"

export function MyComponent() {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  function goToCatalog() {
    router.push(`/organization/${slug}/catalogo`)
  }
}
```

---

## Server Actions no contexto da org

```ts
"use server"

import { http } from "@/lib/ky"
import { safeAction } from "@/lib/safe-action"

export async function getOrganizationAuctions(slug: string) {
  return safeAction("getOrganizationAuctions", async () => {
    const res = await http.get(`organization/${slug}/auctions`, {
      next: { tags: [`org-auctions-${slug}`] }
    })
    const data = await res.json<AuctionList>()
    return { code: res.status, data }
  })
}
```

O `http` já injeta `X-Forwarded-Host` automaticamente — o backend usa esse header para resolver o tenant quando necessário.

---

## O que NÃO hardcodar em componentes da organização

```tsx
// ❌ Nome hardcoded
<h1>Bem-vindo à Casa de Leilões Silva</h1>
// ✅ Vem das configurações
<h1>Bem-vindo à {data.name}</h1>

// ❌ Cor hardcoded
<div className="bg-[#1a365d]">
// ✅ Usa variável do tema
<div className="bg-primary">

// ❌ Logo hardcoded
<img src="/logo-silva.png" />
// ✅ Vem das configurações
<img src={data.settings?.logoUrl} />
```

---

## O que NÃO fazer

```ts
// ❌ Resolver o slug manualmente dentro de uma Server Action
import { headers } from "next/headers"

export async function getOrgData() {
  const host = (await headers()).get("host")
  const slug = host?.split(".")[0]  // lógica do middleware duplicada
}

// ❌ Criar instância de ky com X-Forwarded-Host manual
const orgKy = ky.create({
  headers: { "X-Forwarded-Host": slug }  // http já injeta isso
})

// ❌ Adicionar lógica de resolução de tenant fora do middleware
// Toda a lógica de slug/tenant fica em src/lib/proxy/
```
