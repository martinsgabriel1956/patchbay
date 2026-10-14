---
name: ui-component
description: "Use when creating or modifying UI components in this project. Covers Shadcn/ui usage, cn() utility, icon library, toasts, skeletons, inline styles, and when to create vs reuse. Triggers on: 'criar componente', 'add component', 'novo componente', 'UI', 'botão', 'card', 'dialog', 'ícone'."
user-invocable: true
---

# Componentes UI

## Regra principal

**Shadcn/ui é o ponto de partida.** Antes de criar qualquer componente de interface, verificar se já existe em `src/components/ui/`.

Não recriar o que já existe. Não instalar bibliotecas de UI concorrentes (MUI, Chakra, Mantine, etc).

---

## O que existe em `src/components/ui/`

```
accordion       alert           alert-dialog    avatar
badge           breadcrumb      button          calendar
card            carousel        checkbox        collapsible
dialog          drawer          dropdown-menu   form
input           input-group     input-otp       label
navigation-menu pagination      popover         progress
scroll-area     select          separator       sheet
sidebar         skeleton        slider          sonner
switch          table           tabs            textarea
tooltip
```

Verificar essa lista antes de criar qualquer componente de UI básico.

---

## Como usar componentes Shadcn/ui

Importar sempre de `@/components/ui/`:

```tsx
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
```

### Variantes disponíveis

```tsx
// Button
<Button variant="default">Primário</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Deletar</Button>
<Button variant="link">Link</Button>
<Button size="sm">Pequeno</Button>
<Button size="lg">Grande</Button>

// Badge
<Badge variant="default">Ativo</Badge>
<Badge variant="secondary">Secundário</Badge>
<Badge variant="destructive">Erro</Badge>
<Badge variant="outline">Outline</Badge>
```

---

## Customizar sem modificar o original

Os arquivos em `src/components/ui/` são tratados como dependência — não editar diretamente.

Para customizar, usar `className` com `cn()`:

```tsx
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

<Button className={cn("rounded-full w-full", isActive && "bg-primary/80")}>
  Dar lance
</Button>
```

Para criar uma variação reutilizável, criar um wrapper:

```tsx
// src/components/auction/bid-button.tsx
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  isPending?: boolean
  className?: string
  children: React.ReactNode
  onClick?: () => void
}

export function BidButton({ isPending, className, children, onClick }: Props) {
  return (
    <Button
      onClick={onClick}
      disabled={isPending}
      className={cn("w-full h-12 text-base font-semibold", className)}
    >
      {isPending ? "Processando..." : children}
    </Button>
  )
}
```

---

## Quando criar um novo componente

Criar um componente novo apenas quando:

1. Não existe equivalente em `src/components/ui/`
2. É uma combinação de 2+ componentes Shadcn que se repete em 2+ lugares
3. Tem lógica de negócio específica do domínio (ex: `AuctionCard`, `BidPanel`)

---

## `cn()` — merge de classes Tailwind

Usar sempre `cn()` para classes condicionais ou merge. Nunca template literal para classes CSS.

```tsx
import { cn } from "@/lib/utils"

// ✅ CORRETO
<div className={cn("p-4 rounded-lg", isActive && "border-primary border-2", className)}>

// ❌ ERRADO — template literal
<div className={`p-4 rounded-lg ${isActive ? "border-primary border-2" : ""}`}>

// ❌ ERRADO — concatenação
<div className={"p-4 rounded-lg " + (isActive ? "border-primary border-2" : "")}>
```

---

## Feedback visual — toasts e loading

### Toasts (Sonner)

```tsx
import { toast } from "sonner"

toast.success(result.message)
toast.error(result.message)
toast.loading("Processando...")
```

O `Toaster` já está configurado no layout raiz — não adicionar outro.

### Loading states em botões

```tsx
<Button type="submit" disabled={form.formState.isSubmitting}>
  {form.formState.isSubmitting ? "Salvando..." : "Salvar"}
</Button>
```

### Skeleton para carregamento de dados

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
```

---

## Ícones

Usar exclusivamente `lucide-react`. Não instalar outras bibliotecas de ícones.

```tsx
import { ArrowRight, ChevronDown, X, Loader2 } from "lucide-react"

<ArrowRight className="h-4 w-4" />
<Loader2 className="h-4 w-4 animate-spin" />
```

---

## Inline styles

Proibido para valores estáticos. Permitido apenas para valores dinâmicos que não podem ser expressos com Tailwind:

```tsx
// ❌ ERRADO — valor estático como inline style
<div style={{ padding: "16px", backgroundColor: "#fff" }}>

// ✅ CORRETO — valor estático via Tailwind
<div className="p-4 bg-white">

// ✅ PERMITIDO — valor dinâmico sem equivalente em Tailwind
<div style={{ width: `${progress}%` }}>
<div style={{ "--primary": org.primaryColor } as React.CSSProperties}>
```

---

## O que NÃO fazer

```tsx
// ❌ Recriar Button do zero
export function Button({ children }) {
  return <button className="px-4 py-2 bg-blue-500 rounded">{children}</button>
}

// ❌ Usar CSS modules
import styles from "./card.module.css"

// ❌ Usar styled-components ou emotion
const StyledCard = styled.div`padding: 1rem;`

// ❌ Importar componente de biblioteca externa de UI
import { Button } from "@mui/material"
import { Box } from "@chakra-ui/react"

// ❌ Modificar diretamente arquivo em src/components/ui/

// ❌ Classes Tailwind arbitrárias para valores do design system
<div className="bg-[#1a365d]">  // usar bg-primary se for cor do tema
```
