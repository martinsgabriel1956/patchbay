# rebrand

Replaces the project's design token system with a new visual identity. Interactive, destructive, always confirms before writing.

## Token scope

Collect values for these groups, in order:

### Group 1 — Cores principais
- Cor primária (`--primary` + `--primary-foreground`)
- Cor secundária / accent (`--secondary`, `--accent`)
- Background / surface (`--background`, `--card`, `--popover`)
- Foreground / texto (`--foreground`, `--muted-foreground`)
- Destructive, success, warning (perguntar se o usuário quer manter os valores atuais ou substituir)

### Group 2 — Tipografia
- Font family principal (body)
- Font family display/heading (se diferente)
- Perguntar se o usuário quer importar do Google Fonts ou usar uma fonte já instalada

### Group 3 — Forma
- Border radius base (`--radius`) — três opções: sharp (0), rounded (0.5rem), pill (1rem), ou valor customizado
- Escala de espaçamento — perguntar se quer manter a escala Tailwind padrão ou definir uma base custom

### Group 4 — Elevação
- Sombras — três perfis: flat (sem sombra), subtle, elevated; ou custom

### Group 5 — Tokens de domínio (auto-detectados)
Antes de perguntar este grupo, ler `src/app/globals.css` e identificar todos os tokens CSS que **não fazem parte** do conjunto padrão Shadcn/ui. Apresentar cada um ao usuário com seu nome e valor atual e perguntar se quer substituir.

Tokens padrão Shadcn/ui a ignorar nesta detecção:
`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`, `--chart-1` a `--chart-5`, `--sidebar` e variantes de sidebar, `--success`, `--warning`, `--warning-foreground`

## Fluxo

```
1. Ler src/app/globals.css → mapear tokens existentes
2. Perguntar grupo 1 (Cores principais) — uma pergunta por token
3. Perguntar grupo 2 (Tipografia)
4. Perguntar grupo 3 (Forma)
5. Perguntar grupo 4 (Elevação)
6. Auto-detectar tokens de domínio → perguntar grupo 5
7. Converter todos os valores de cor para oklch
8. Calcular pares foreground automaticamente:
   - Se o fundo do token for escuro (L < 50%), foreground = claro (L ≥ 93%)
   - Se o fundo for claro (L ≥ 50%), foreground = escuro (L ≤ 25%)
9. Mostrar resumo de confirmação (ver abaixo)
10. Aguardar confirmação explícita
11. Aplicar em src/app/globals.css
```

## Conversão para OKLCH

Para converter hex/hsl/rgb para oklch, use o algoritmo mental aproximado ou a ferramenta `npx oklch-convert` se disponível. Na ausência de ferramenta, use estes mapeamentos como base e ajuste pela lógica de gamut:

- Hex claro (>80% brilho) → L 0.85–0.97
- Hex médio (40–80%) → L 0.45–0.75
- Hex escuro (<40%) → L 0.15–0.40
- Saturação HSL → chroma oklch: 0% = 0, 50% = ~0.1, 100% = ~0.25 (varia por hue)

Declare explicitamente no output: `/* converted from #XXXXXX */` como comentário inline para rastreabilidade.

## Resumo de confirmação

Antes de escrever, exibir:

```
Resumo do rebrand:
─────────────────────────────────────────
Cores principais    8 tokens alterados
Tipografia          2 tokens alterados
Forma               2 tokens alterados
Elevação            1 token alterado
Domínio (leilão)    3 tokens alterados
─────────────────────────────────────────
Total               16 tokens em globals.css

Confirmar? (s/n)
```

Só escrever após confirmação explícita.

## Aplicação

Editar apenas `src/app/globals.css`. Substituir os valores dos tokens dentro do bloco `:root { }`. Não remover tokens existentes — apenas substituir valores. Manter comentários inline existentes.

Se a tipografia mudou, verificar se a nova fonte está importada no topo do arquivo ou no `layout.tsx`. Se não estiver, alertar o usuário e mostrar o `@import` ou `next/font` necessário — não aplicar automaticamente sem confirmação.
