# Patchbay — Planejamento

Cliente de API (HTTP, WebSocket, SSE) no estilo Postman / Insomnia / Hoppscotch / Bruno.
Princípio: **local-first, arquivos no disco, sem conta, sem cloud.**

É um **app desktop** (Tauri) em três pacotes:
- **`api/`**: servidor local em Node. Executa as requests de verdade e lê/escreve as coleções no disco. No app, roda como processo filho (sidecar) do Tauri.
- **`web/`**: interface React. Roda dentro da janela do Tauri e conversa só com a `api/`.
- **`desktop/`**: casca Tauri 2 em Rust (pouco código). Abre a janela, sobe e encerra a `api/`, cuida da bandeja (tray) e do modo em segundo plano.

---

## 1. Por que existe uma `api/`

A webview tem as mesmas limitações de um browser:
- **CORS**: a maioria das APIs bloqueia chamadas vindas de outra origem.
- **Headers proibidos**: não deixa definir `Host`, `Cookie`, `Origin`, `User-Agent`, `Content-Length` e outros.
- **WebSocket**: o `new WebSocket()` não aceita headers customizados no handshake (ex: `Authorization`).
- **Disco**: não lê nem escreve pastas livremente.

A `api/` resolve os quatro: a `web/` descreve a request, a `api/` executa e devolve o resultado cru.

**Regras:**
- A `api/` só transporta bytes e mexe em arquivos. Lógica de produto (variáveis, auth → headers, cURL, UI) fica na `web/`.
- O `desktop/` só cuida do ciclo de vida: janela, tray, sidecar. Nenhuma lógica de produto em Rust.

---

## 2. Stack

Mesma base dos outros projetos (interno/leilão), para aproveitar skills, agentes e costume.

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | **npm workspaces** (`api`, `web`) + crate Rust em `desktop/` | Um `npm install` e um `npm run dev` na raiz, sem Turborepo/Nx |
| Desktop | **Tauri 2** + plugins `single-instance` e `shell` (sidecar); tray pela feature `tray-icon` do core | App leve com a webview do sistema; tray e segundo plano nativos |
| API | **Node 22 + TypeScript + Fastify** | Já usado no leilão; `@fastify/websocket` e `fastify-type-provider-zod` prontos |
| Empacotar a API | **esbuild** (bundle num arquivo) + **Node SEA** (executável único) | Vira o binário sidecar do Tauri; quem usa não precisa ter Node instalado |
| Execução HTTP | **`undici`** (`request` + `Agent`) | Controle total: headers crus, sem descompressão automática, redirect manual, aceitar certificado inválido por request |
| WebSocket upstream | **`ws`** | Aceita headers e subprotocols no handshake |
| Validação | **Zod** | Mesmo schema valida na API e gera os tipos usados pela Web |
| Web | **React + Vite + TypeScript** | SPA pura: não precisa de SSR, então Next é peso morto |
| UI | **Tailwind + shadcn/ui** | Já usado nos outros projetos; os tokens vêm do `DESIGN.md` |
| Estado | **Zustand** | Abas abertas, environment ativo, request em edição. Skill já copiada |
| Editor de body/resposta | **CodeMirror 6** | Syntax highlight e fold de JSON, bem mais leve que Monaco |
| Persistência | **Arquivos JSON no disco** (1 request = 1 arquivo, coleção = pasta) | Versionável no git (modelo do Bruno), sem banco |
| Lint/format | **Biome** (TS) + `cargo fmt`/`clippy` (Rust) | Padrão dos outros projetos |
| Testes | **Vitest** | Idem |

Sem Prisma, sem Redis, sem fila, sem auth de usuário: é um app local de uma pessoa só.

Alvo inicial: **Linux** (máquina do autor), empacotado como AppImage e `.deb`. macOS/Windows depois, se fizer falta.

---

## 3. Estrutura

```
http-client/
  package.json            # workspaces + scripts "dev", "dev:web", "build"
  biome.json
  PLANNING.md  PRODUCT.md  DESIGN.md
  brand/                  # logo, ícones, folha de identidade
  api/
    .claude/
    package.json
    src/
      server.ts           # Fastify em 127.0.0.1, porta livre; imprime {port, token}; sai quando o stdin fecha
      schemas.ts          # Zod: HttpRequest, HttpResponse, etc. (fonte única dos tipos)
      routes/
        send.ts           # POST /send
        realtime.ts       # WS /realtime (proxy WS e SSE)
        files.ts          # árvore/leitura/escrita das coleções
      lib/
        http.ts           # executa request via undici
        workspace.ts      # resolve caminhos dentro da pasta raiz (anti path traversal)
  web/
    .claude/
    package.json
    index.html            # script inline aplica o tema antes do primeiro paint
    vite.config.ts
    src/
      features/
        request-editor/
        response-viewer/
        realtime/         # log de mensagens WS/SSE
        sidebar/          # coleções + histórico
        environments/
        settings/         # tema, comportamento ao fechar
      lib/
        api-client.ts     # descobre porta + token (Tauri ou modo browser) e fala com a api
        desktop.ts        # ponte com o Tauri: invoke, eventos da tray
        interpolate.ts    # {{var}}
        curl.ts           # import/export cURL
      styles/
        tokens.css        # tokens dos temas escuro e claro (do DESIGN.md)
      stores/
  desktop/
    Cargo.toml
    tauri.conf.json       # frontendDist ../web/dist, devUrl do Vite, externalBin binaries/patchbay-api
    icons/                # gerados a partir de brand/app-icon.svg; ícone de tray a partir de brand/favicon.svg
    binaries/             # patchbay-api-<target-triple> (build)
    src/
      main.rs             # janela, tray, close → esconder, sidecar, single-instance
```

A `web/` importa só os **tipos** da `api/` (`import type` a partir de `api/src/schemas.ts`, via `paths` no tsconfig). Nada de pacote `shared/` até ter algo além de tipos para compartilhar.

A arquitetura Route → Controller → UseCase → Repository dos outros projetos **não** se aplica inteira aqui: a `api/` tem ~3 rotas finas e nenhuma regra de negócio. Rota + função em `lib/` basta. Se crescer, aí entram as camadas.

---

## 4. Desktop: janela, tray e segundo plano

### Ciclo de vida
1. O Tauri inicia e sobe a `api/` como processo filho. Em produção é o sidecar `patchbay-api`. Em dev é `npx tsx api/src/server.ts`.
2. A `api/` escuta em `127.0.0.1` numa porta livre e imprime **uma linha JSON** no stdout: `{"port": 51234, "token": "…"}`.
3. O Rust lê essa linha e guarda os dois valores. A `web/` pede os dois via `invoke("api_info")` ao carregar.
4. A `api/` **sai sozinha quando o stdin fecha**. Se o app morrer de qualquer jeito, não sobra processo Node órfão.

### Fechar a janela = ir para a bandeja
- Clicar no X **esconde** a janela (`CloseRequested` → `prevent_close()` + `hide()`). Não destrói nada.
- Como a webview continua viva, conexões WebSocket/SSE abertas, requests em andamento e abas não salvas **continuam como estavam**. Reabrir é instantâneo.
- A preferência "Ao fechar a janela" fica em Configurações: **minimizar para a bandeja** (padrão) ou **sair**. A `web/` informa o Rust via `invoke("set_close_to_tray", …)` ao carregar e quando o usuário muda.

### Menu da tray
- **Abrir Patchbay**: mostra e foca a janela.
- **N conexões ativas**: rótulo informativo, atualizado pela `web/` via `invoke("set_tray_status", …)`. Some quando é zero.
- **Sair**: encerra de verdade (fecha a `api/`, derruba as conexões).
- Clique esquerdo no ícone abre a janela onde o sistema suportar. No Linux com AppIndicator só existe o menu, e por isso "Abrir Patchbay" é o primeiro item.

### Instância única
Abrir o Patchbay de novo enquanto ele está na bandeja **foca a janela existente** (`tauri-plugin-single-instance`). Nunca sobe uma segunda `api/`.

### Atalho global
Nenhum por enquanto (ver Fase 6+).

---

## 5. Temas

Três opções: **Escuro** (padrão), **Claro** e **Sistema** (acompanha o tema do SO e muda junto, ao vivo).

- **Tokens:** CSS variables em `web/src/styles/tokens.css`, um bloco por tema (`:root[data-theme="dark"]`, `:root[data-theme="light"]`). "Sistema" resolve via `prefers-color-scheme` e escuta mudanças.
- **Sem flash:** um script inline no `index.html` lê a preferência e aplica `data-theme` antes do primeiro paint.
- **Janela nativa:** a barra de título do Tauri segue o tema (`window.setTheme`).
- **Onde trocar:** Configurações e command palette ("Tema: Escuro / Claro / Sistema").
- **Persistência:** `localStorage` da webview. É configuração do app, não dado do usuário, então não vai para o workspace.

**O tema claro precisa ser desenhado antes de codar.** Hoje o `DESIGN.md` só define o escuro. O claro é uma extensão do mesmo mundo, não um mundo novo: tinta preta sobre o branco-papel da marca (`#f2f1ec`), seleção continua sendo inversão (linha preta), as fitas de código e o laranja de "vivo" se mantêm, com contraste reconferido. A marca já tem as versões claras (`mark-light`, `lockup-light`, `wordmark-light`). Essa rodada de design atualiza o `DESIGN.md` com os tokens claros.

---

## 6. Contrato entre Web e API

### `POST /send`
Corpo: `HttpRequest` já resolvido (variáveis substituídas, auth convertida em header/query).
Resposta: `HttpResponse`.

**Cancelar:** a `web/` aborta o próprio `fetch` (`AbortController`); a `api/` detecta a conexão fechada e aborta o upstream. Não precisa de endpoint de cancelamento.

### `WS /realtime`
Uma conexão WebSocket web↔api por sessão realtime:
1. 1ª mensagem da web: `{ kind: "ws" | "sse", url, headers, protocols? }`
2. A api abre o upstream e repassa eventos: `{ type: "open" | "message" | "error" | "close", data?, at }`
3. Mensagens seguintes da web (só `ws`) são enviadas ao upstream.
4. Fechar de qualquer lado fecha o outro.

SSE passa pelo mesmo canal: a api faz o GET com stream, separa os blocos `event:`/`data:` e repassa como `message`. Assim a mesma UI de log serve para os dois.

Mudanças no disco também: com `{ kind: "watch" }` como 1ª mensagem, a api observa o workspace (um `fs.watch` por pasta, debounce de 150ms, sem ocultos nem o que ela mesma escreveu) e manda `{ type: "changed", paths }`. A web recarrega a árvore e as abas: aba limpa recarrega calada; com alteração não salva fica marcada (recarregar ou manter); arquivo apagado vira rascunho.

### Arquivos
- `GET /files/tree`: árvore da pasta de trabalho (sem ocultos: `.git`, `.trash`, `.history.jsonl`)
- `GET /files?path=`: lê um arquivo (texto)
- `PUT /files?path=`: escreve o corpo `text/plain` (atômico: temp + rename); path terminado em `/` cria a pasta
- `DELETE /files?path=`: move para `<workspace>/.trash/<mesmo caminho>` (colisão vira `nome 2.json`)
- `POST /files/move` e `POST /files/copy` (`{from, to}`): renomeia/move e duplica; nunca sobrescrevem (409)
- `GET /history?limit=`: últimas entradas do `.history.jsonl`, mais nova primeiro. Cada `POST /send` acrescenta uma linha com a request e só o resumo da resposta (status, tempo, tamanho, data) ou o motivo da falha

A api só move bytes: quem formata o JSON (2 espaços, chaves em ordem fixa) é a web. Ao criar o workspace, a api escreve um `.gitignore` (se não existir) com `.history.jsonl`, `.trash/` e `.env.local.json`.

A pasta de trabalho é definida ao subir a api (`WORKSPACE_DIR`, padrão `~/patchbay`). **Todo `path` é resolvido e conferido para ficar dentro dela.**

### Ponte Web ↔ Desktop (Tauri `invoke`)
| Comando | Direção | Para quê |
|---|---|---|
| `api_info` | web → rust | Porta e token da `api/` |
| `set_close_to_tray(bool)` | web → rust | Preferência de fechar |
| `set_tray_status({ activeConnections })` | web → rust | Rótulo da tray |

Fora do Tauri (modo `dev:web`, só para desenvolver no browser), `lib/desktop.ts` vira no-op e `api-client.ts` usa porta fixa + token por variável de ambiente via proxy do Vite.

---

## 7. Segurança da `api/` (obrigatório desde a Fase 0)

A `api/` é, por definição, um **proxy aberto que executa qualquer request e escreve em disco**, e agora fica rodando em segundo plano. Qualquer site aberto num browser pode tentar falar com `localhost`. Então:

1. **Bind só em `127.0.0.1`**, nunca `0.0.0.0`. Porta livre escolhida pelo SO (`listen(0)`), sem conflito com nada.
2. **Checar `Host`**: aceitar só `127.0.0.1:<porta>` / `localhost:<porta>`. Bloqueia DNS rebinding.
3. **Checar `Origin`** contra uma allowlist exata: a origem da webview do Tauri (`tauri://localhost`; `http://tauri.localhost` no Windows) e, só em dev, a do Vite. Vale também para o upgrade do WS.
4. **CORS só para essas origens.** A webview e a api são origens diferentes, então a api responde CORS, mas nunca com `*`.
5. **Token de sessão**: gerado pela api a cada execução, entregue ao Rust pelo stdout e à web pelo `invoke`. Vai em todo request (`X-Session-Token`). Em produção nunca é gravado em disco.
6. **Path traversal**: `workspace.ts` resolve com `path.resolve` e recusa qualquer coisa fora da raiz (incluindo via symlink: usar `fs.realpath`).
7. **Tauri capabilities**: a janela só recebe permissão para os três comandos acima. Sem `fs`, sem `shell` no frontend.

---

## 8. Modelo de dados (em `api/src/schemas.ts`, como Zod)

```ts
type KV = { key: string; value: string; enabled: boolean };

type Body =
  | { type: "none" }
  | { type: "json" | "text" | "xml"; content: string }
  | { type: "form-urlencoded"; fields: KV[] }
  | { type: "multipart"; fields: (KV & { file?: string })[] }  // file = path dentro do workspace
  | { type: "binary"; file: string };

type Auth =
  | { type: "none" | "inherit" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };

type HttpRequest = {
  id: string; name: string; kind: "http";
  method: string; url: string;
  params: KV[]; headers: KV[]; body: Body; auth: Auth;
  options?: { timeoutMs?: number; followRedirects?: boolean; insecureTls?: boolean };
};

type RealtimeRequest = {
  id: string; name: string; kind: "ws" | "sse";
  url: string; headers: KV[]; protocols?: string[];
};

type Environment = { name: string; vars: KV[] };

type HttpResponse = {
  status: number; statusText: string;
  headers: [string, string][];   // array: headers podem repetir (Set-Cookie)
  body: string;                  // base64 se binário
  isBinary: boolean;
  truncated: boolean;
  timeMs: number; sizeBytes: number;
};
```

Configurações do app (só na `web/`, em `localStorage`):

```ts
type Settings = {
  theme: "dark" | "light" | "system";   // padrão "dark"
  closeToTray: boolean;                 // padrão true
  locale: "en" | "pt-BR";
};
```

Layout no disco:

```
~/patchbay/                 # WORKSPACE_DIR
  minha-colecao/
    collection.json         # nome, auth/headers herdados
    environments/
      dev.json
      prod.json
    users/
      list-users.json
      create-user.json
    .env.local.json         # segredos (gitignored)
  .history.jsonl            # histórico global, append-only
```

---

## 9. Fases

Cada fase termina com algo **usável**. Não começar a próxima antes.

### Antes da Fase 0: tema claro
- Rodada de design (`/impeccable`) estendendo o mundo atual para o tema claro, como descrito na seção 5
- `DESIGN.md` atualizado com os tokens claros
- ✅ Folha de identidade mostra a tela do app nos dois temas

### Fase 0: Scaffold + casca desktop
- `package.json` raiz com workspaces; `npm run dev` = `tauri dev` (sobe Vite, a `api/` via tsx e a janela); `npm run dev:web` = api + Vite no browser, sem Tauri
- `api/`: Fastify + `GET /health` + guardas da seção 7 + handshake `{port, token}` no stdout + sair ao fechar o stdin
- `web/`: Vite + React + Tailwind + shadcn com os tokens dos dois temas, layout em 3 colunas vazio, seletor de tema (Configurações + command palette), script anti-flash
- `desktop/`: Tauri 2 com janela, sidecar, close → esconder, tray (Abrir / conexões ativas / Sair), instância única, preferência "ao fechar" ligada ao `invoke`
- Ícones do app e da tray gerados a partir de `brand/`
- Build: esbuild + Node SEA gera `patchbay-api`; `tauri build` gera AppImage e `.deb`
- Biome, Vitest, `cargo fmt`/`clippy` configurados
- ✅ App abre, mostra "api ok" e troca de tema; fechar a janela deixa o Patchbay na bandeja; "Abrir" volta para onde estava; "Sair" não deixa processo Node para trás

### Fase 1: MVP HTTP (o coração)
- **api:** `POST /send` com undici: timeout, follow redirects (toggle), certificado inválido (toggle), cancelamento por conexão fechada, truncar body acima de ~5 MB, base64 para binário
- **web:** método + URL + Send (Ctrl+Enter); abas Params (sincroniza com a query da URL), Headers, Body (none/json/text/form-urlencoded/multipart)
- **web:** resposta com status colorido, tempo, tamanho, headers, body com pretty-print de JSON, preview de imagem, raw
- ✅ Consigo testar uma API REST real, inclusive uma que bloquearia CORS

### Fase 2: Persistência
- **api:** rotas de `/files` + histórico em `.history.jsonl`
- **web:** árvore de coleções na sidebar; criar / renomear / duplicar / deletar / mover
- **web:** salvar com Ctrl+S, indicador de "não salvo", abas de requests abertas
- ✅ Fecho e reabro sem perder nada; a pasta pode ir pro git

### Fase 3: Variáveis e Auth (só web)
- Environments + seletor no topo
- Interpolação `{{var}}` em URL, headers, params, body e auth (`lib/interpolate.ts`)
- Variável indefinida destacada em vermelho
- Precedência: coleção < environment < `.env.local.json`
- Auth: Bearer, Basic, API Key; herança da coleção/pasta
- ✅ Troco de dev pra prod num clique

### Fase 4: WebSocket
- **api:** `WS /realtime` com `ws` no upstream, headers e subprotocols no handshake
- **web:** status da conexão, log de mensagens (enviada/recebida, timestamp, JSON formatado), input de envio
- **desktop:** contador de conexões ativas na tray
- ✅ Converso com um echo server mandando `Authorization` no handshake; fecho a janela, a conexão continua, reabro e o log seguiu

### Fase 5: SSE + produtividade
- **api:** SSE pelo mesmo `/realtime`
- **web:** reaproveita a UI de log
- **web:** importar cURL (colar na barra de URL já detecta) e exportar como cURL
- **web:** importar coleção Postman v2.1 / Insomnia
- GraphQL: é só POST com JSON, então vira um modo de body "graphql" (query + variables). Introspection/autocomplete depois
- Cookies: cookie jar por environment (na api, `tough-cookie`) se fizer falta

### Fase 6+: só quando sentir falta
| Feature | Adicionar quando |
|---|---|
| Iniciar com o sistema (autostart) | Abrir o app toda manhã incomodar |
| Notificação nativa de mensagem realtime com a janela escondida | Precisar vigiar um stream sem olhar a tela |
| Atalho global para mostrar/esconder | O clique na tray ficar lento demais no dia a dia |
| Builds para macOS / Windows | Precisar usar fora do Linux |
| Scripts pre/post-request + testes | Precisar encadear requests (ex: login → token). Exige sandbox JS (`isolated-vm`): custo alto |
| Timing detalhado (DNS / TCP / TLS / TTFB) | Precisar diagnosticar latência |
| OpenAPI import | Tiver uma spec grande pra importar |
| Code gen (fetch, axios, python…) | cURL não bastar |
| gRPC | Precisar de verdade: reflection + protobuf é um projeto à parte |
| Socket.IO / MQTT | Idem |
| Segredos no keychain do SO | O `.env.local.json` gitignored não bastar |
| Proxy / mTLS / certificados de cliente | Bater numa API corporativa que exija |
| Runner de coleção | Existirem scripts/testes |
| Auto-update | Distribuir para mais alguém |
| Sync / times / cloud | Provavelmente nunca: git resolve |

---

## 10. Pontos de atenção

- **Headers repetidos**: nunca usar `Map`/objeto para headers de resposta.
- **Encoding de URL**: não re-encodar o que o usuário já encodou; testar com `%20`, `+` e unicode.
- **Compressão**: mostrar o tamanho real trafegado e o descomprimido; descomprimir só para exibir.
- **Segredos**: nunca dentro da coleção versionada; vão em `.env.local.json`.
- **Binário**: detectar por `Content-Type`; trafegar em base64 entre api e web.
- **Conexões realtime órfãs**: se o WS web↔api cair, a api fecha o upstream.
- **Tray no Linux**: o GNOME precisa da extensão AppIndicator para mostrar ícones de bandeja (KDE e a maioria dos outros já mostram). Sem tray visível, fechar para a bandeja "some" com o app: se o Rust não conseguir criar a tray, fechar a janela passa a sair de verdade.
- **WebKitGTK**: no Linux a webview é WebKit, não Chromium. Testar CodeMirror, `zoom`, fontes variáveis e `prefers-color-scheme` nela, não só no Chrome do `dev:web`.
- **Janela escondida**: webviews podem reduzir timers em segundo plano. Os frames continuam chegando (eventos de rede não são limitados), mas animações e relógios da UI só valem com a janela visível.
- **Sidecar**: o binário Node SEA tem dezenas de MB. Aceitável, mas é o maior pedaço do app.

---

## 11. Testes

- **api:** 1 teste de integração do `/send` contra um Fastify local de eco (GET, POST JSON, multipart, timeout, cancelamento) + 1 teste do `workspace.ts` (path traversal, symlink para fora) + 1 teste das guardas (`Host`/`Origin`/token/CORS) + 1 teste de que o processo sai quando o stdin fecha
- **web:** 1 arquivo Vitest para `interpolate.ts` e `curl.ts` (as duas lógicas com mais casos de borda)
- **desktop (manual, checklist da Fase 0):** fechar esconde · tray reabre no mesmo estado · "Sair" não deixa `patchbay-api` rodando (`pgrep`) · abrir de novo foca a janela existente · troca de tema muda a barra de título · com "ao fechar: sair", o X encerra
- **Manual:** `httpbin.org`, `echo.websocket.org`, `sse.dev`

---

## 12. Decisões em aberto

1. ~~Formato no disco~~ **Decidido (Fase 2): JSON**, 2 espaços, chaves em ordem fixa, 1 request = 1 arquivo, nome do arquivo = nome da request.
2. ~~Deletar de vez ou `.trash/`~~ **Decidido (Fase 2): mover para `<workspace>/.trash/`**, preservando o caminho relativo e sem colisão. Esvaziar a lixeira é à mão.
3. Licença / open source?
