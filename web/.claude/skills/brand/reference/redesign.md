# redesign

Mapeia a interface existente, faz perguntas guiadas por dimensão e aplica mudanças estruturais. Nunca altera tokens de design — para isso, use `rebrand`.

## Escopo

O argumento passado após `redesign` define o escopo:

- **Com caminho**: ex. `/brand redesign src/app/dashboard` → mapear apenas os arquivos nesse diretório
- **Sem caminho**: mapear o projeto inteiro a partir dos pontos de entrada (`src/app/layout.tsx`, pages, componentes em `src/components/`)

Limite o mapeamento a arquivos `.tsx` e `.ts` com JSX. Ignorar `node_modules`, `__tests__`, `.storybook`, arquivos `*.stories.*`.

## Fluxo

```
1. Mapear a interface (ver seção Mapeamento)
2. Exibir relatório de mapeamento
3. Perguntar por dimensão — uma de cada vez (ver seção Dimensões)
4. Consolidar todas as respostas
5. Exibir resumo de confirmação
6. Aguardar confirmação explícita
7. Aplicar mudanças nos arquivos identificados
```

## Mapeamento

Ao mapear, extrair e reportar:

- **Estrutura de rotas**: listar pages encontrados e seus layouts pai
- **Componentes por categoria**: navigation, cards, tables, forms, modals, empty states, loaders
- **Padrões de layout**: grid, flex, container widths, breakpoints usados
- **Densidade**: estimativa de padding/gap dominante (compact / comfortable / spacious)
- **Hierarquia tipográfica**: headings usados (h1–h4), tamanhos, pesos
- **Estados cobertos**: loading, error, empty encontrados nos arquivos

Exibir o relatório antes de fazer qualquer pergunta. Formato:

```
Mapeamento: src/app/dashboard
─────────────────────────────────────────
Rotas          3 pages, 1 layout pai
Componentes    12 cards, 2 tabelas, 1 nav, 3 formulários
Layout         CSS Grid + Flexbox. Container: max-w-7xl. Gap dominante: gap-4/gap-6
Densidade      Comfortable (p-4/p-6)
Tipografia     text-2xl bold (h1), text-lg semibold (h2), text-sm muted (labels)
Estados        Loading: 2 skeletons. Error: 1 boundary. Empty: 0
─────────────────────────────────────────
```

## Dimensões

Perguntar cada dimensão separadamente, nesta ordem. Para cada uma, apresentar o estado atual detectado e perguntar o que o usuário quer mudar.

### 1. Layout
Apresentar: estrutura de grid atual, container widths, breakpoints.
Perguntar: quer alterar a estrutura de colunas? Mudar de grid para flex ou vice-versa? Ajustar a largura máxima do container?

### 2. Hierarquia visual
Apresentar: headings e tamanhos detectados, contraste entre níveis.
Perguntar: a hierarquia está clara? Quer ampliar ou reduzir o contraste entre h1/h2/body? Mudar pesos?

### 3. Componentes
Apresentar: padrões de card, tabela, nav encontrados.
Perguntar: algum componente precisa ser substituído por uma alternativa mais adequada? Cards virando listas? Tabelas virando cards em mobile?

### 4. Motion
Apresentar: animações e transições encontradas (classes Tailwind `transition-*`, `animate-*`, `duration-*`).
Perguntar: quer adicionar, remover ou alterar transições? Qual intenção — mais snappy, mais suave, sem motion?

### 5. Estados
Apresentar: cobertura de loading, error e empty states encontrada.
Perguntar: há estados faltando? Quer padronizar os skeletons? Adicionar empty states onde faltam?

### 6. Acessibilidade
Apresentar: uso de `aria-*`, roles, `sr-only`, contraste estimado pelos tokens atuais.
Perguntar: há elementos interativos sem label acessível? Quer adicionar foco visível, melhorar contraste, ou adicionar anúncios para screen readers?

### 7. Responsividade
Apresentar: breakpoints usados, componentes sem variante mobile detectados.
Perguntar: há layouts que quebram em mobile? Quer colapsar colunas, esconder elementos, ou ajustar tipografia em telas menores?

## Resumo de confirmação

Antes de aplicar, exibir:

```
Resumo do redesign: src/app/dashboard
─────────────────────────────────────────────────────
Layout              Container max-w-5xl → max-w-6xl. Grid 3col → 2col em md
Hierarquia visual   h1 text-2xl → text-3xl. Contraste h2 ampliado
Componentes         4 cards de métrica → lista horizontal
Motion              Adicionar transition-all duration-200 em 3 componentes
Estados             3 empty states adicionados
Acessibilidade      6 aria-label adicionados em botões de ícone
Responsividade      2 grids colapsam para 1col em sm
─────────────────────────────────────────────────────
Arquivos afetados   7

Confirmar? (s/n)
```

## Aplicação

Editar os arquivos identificados no mapeamento. Regras:

- Não alterar lógica de negócio, apenas estrutura JSX e classes Tailwind
- Não alterar tokens CSS — esses pertencem ao `rebrand`
- Se uma mudança exigir criar um novo componente, criar no mesmo diretório com o sufixo do padrão do projeto
- Manter imports existentes; adicionar novos imports apenas quando necessário
- Aplicar as mudanças de todas as dimensões confirmadas em uma única passagem por arquivo — não editar o mesmo arquivo múltiplas vezes
