# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

App desktop, monorepo com npm workspaces, detalhado em `PLANNING.md`:
- `desktop/`: Tauri 2 (Rust, só ciclo de vida): janela, tray, segundo plano, instância única, e sobe a `api/` como sidecar. Escolhido pelo autor em vez de Electron por ser mais leve.
- `api/`: Node 22 + TypeScript + Fastify, `undici` (HTTP) e `ws` (WebSocket). Servidor local em `127.0.0.1` que executa as requests e lê/escreve as coleções no disco. Empacotada como executável único (Node SEA).
- `web/`: React + Vite + TypeScript, Tailwind + shadcn/ui, Zustand e CodeMirror 6. Roda na webview do Tauri e conversa só com a `api/`.
- Biome, Vitest e Zod nos pacotes TS.

Alvo inicial: Linux (AppImage e `.deb`).

## Users

Uma pessoa: o próprio autor, desenvolvedor fullstack (Node/TypeScript, React) que testa e depura as APIs dos projetos em que trabalha no dia a dia (REST, WebSocket, SSE). Se outras pessoas usarem, é bônus. Não é um produto para time nem para o público.

## Product Purpose

Client de API para montar, enviar e inspecionar requests HTTP, WebSocket e SSE, guardando as coleções como arquivos no disco. Existe para substituir Postman, Insomnia, Hoppscotch e Bruno no uso pessoal sem o peso, o login e o atrito deles.

Sucesso: é a ferramenta que o autor abre por reflexo para testar um endpoint e não sente falta das outras.

## Positioning

Quatro compromissos, todos ao mesmo tempo:
- **Leve e instantâneo:** abre na hora, sem login, sem conta, sem telemetria, sem upsell.
- **Local-first + git:** coleções são arquivos JSON legíveis no disco, versionáveis junto do código.
- **Realtime de primeira classe:** WebSocket e SSE recebem o mesmo cuidado que HTTP, não são um apêndice.
- **Teclado primeiro:** tudo alcançável por atalho e command palette.

## Operating Context

- App desktop no Linux. Fechar a janela **não encerra**: o Patchbay fica na bandeja (tray), com conexões realtime e abas como estavam, e reabre na hora. "Sair" no menu da tray encerra de verdade. Dá para trocar para "fechar = sair" nas configurações.
- Em desenvolvimento, `npm run dev` abre o app via `tauri dev`.
- Usado ao lado do editor de código e do terminal, durante desenvolvimento e debug de APIs próprias (Node/Fastify/Express) e de terceiros.
- A pasta de trabalho (`WORKSPACE_DIR`, padrão `~/patchbay`) pode ser um repositório git.
- Segredos ficam em `.env.local.json`, fora do versionamento.

## Capabilities and Constraints

Roadmap por fases em `PLANNING.md`: HTTP (MVP) → persistência → environments/variáveis/auth → WebSocket → SSE, cURL import/export, import Postman/Insomnia, GraphQL.

Restrições:
- A `api/` executa qualquer request e escreve em disco: bind só em `127.0.0.1`, checagem de `Host` e `Origin`, token de sessão e proteção contra path traversal são obrigatórios.
- Sem banco de dados, sem auth de usuário, sem cloud/sync.
- Interface com i18n: inglês e português (pt-BR).
- Temas: **Escuro** (padrão), **Claro** e **Sistema** (acompanha o SO). O tema claro ainda precisa ser desenhado como extensão do mundo atual antes de codar.
- Tray: no GNOME depende da extensão AppIndicator; sem tray disponível, fechar a janela encerra o app.

Decidido: formato no disco é JSON; deletar move para `.trash/` no workspace.

Em aberto:
- Licença / open source.

## Brand Commitments

- **Nome: Patchbay.** Escolhido pelo autor. O patchbay é o painel de estúdio/central telefônica onde se liga uma entrada a uma saída à mão: roteamento, controle manual, sinal cru. Grafia: `Patchbay` (marca), `patchbay` (CLI, pacote, pasta).
- O nome convive com o método HTTP `PATCH` dentro da própria interface; a marca nunca deve depender de destacar "PATCH" isoladamente.
- O logo precisa funcionar como **favicon (16–32px)** e como **ícone de app** (dock/launcher).
- A identidade não pode parecer: **fofa/brinquedo** (mascote, cores infantis), **hacker clichê** (preto com verde/neon, terminal de filme) nem **genérica** (shadcn cinza com um azul qualquer).

## Evidence on Hand

Nenhum conteúdo, depoimento, métrica ou asset existe. Não inventar números de desempenho, usuários ou comparativos.

## Product Principles

1. **Zero atrito até o primeiro request.** Nada fica entre abrir o app e apertar Send.
2. **O disco é a verdade.** O que está na tela é o que está no arquivo; nada escondido num banco.
3. **Mostrar o que aconteceu, cru.** Status, headers repetidos, bytes, tempo e frames exatamente como vieram, sem "ajudar" escondendo detalhes.
4. **Toda ação tem atalho.** O mouse é opcional.
5. **Só existe o que o autor usa.** Feature entra quando faz falta, não para competir em checklist.

## Accessibility & Inclusion

Uso pessoal sem requisito específico além do básico: contraste legível em sessões longas, navegação completa por teclado (já é princípio do produto) e foco visível.
