---
name: Patchbay
description: Client de API local-first como sessão de estúdio catalogada. Fosco e tinta, cor só como código; escuro por padrão, claro como o mesmo mundo invertido.
colors:
  matte: "#0d0d0c"
  panel: "#161615"
  rule: "#2a2a28"
  paper: "#f2f1ec"
  dim: "#8f8e88"
  dim-on-paper: "#5c5b55"
  cord: "#ff5b1f"
  dev: "#45b36b"
  local: "#5c78f2"
  staging: "#f0b429"
  prod: "#e5483a"
  bg: "#0d0d0c"
  surface: "#161615"
  line: "#2a2a28"
  ink: "#f2f1ec"
  ink-2: "#d9d8d1"
  ink-3: "#bdbcb4"
  mute: "#8f8e88"
  dev-text: "#45b36b"
  local-text: "#5c78f2"
  staging-text: "#f0b429"
  prod-text: "#e5483a"
  cord-text: "#ff5b1f"
  focus: "#ff5b1f"
  bg-light: "#f2f1ec"
  surface-light: "#e7e6df"
  line-light: "#cfcec6"
  ink-light: "#0d0d0c"
  ink-2-light: "#2b2b28"
  ink-3-light: "#4a4944"
  mute-light: "#66655f"
  dev-text-light: "#1f7a42"
  local-text-light: "#3c55d4"
  staging-text-light: "#8a5a00"
  prod-text-light: "#b8321f"
  cord-text-light: "#b8400a"
  focus-light: "#b8400a"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(40px, 5.4vw, 76px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 4vw, 52px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 82"
  title-condensed:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.4vw, 44px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 62"
  lede:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(17px, 1.6vw, 20px)"
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'wdth' 100"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'wdth' 100"
  title-sm:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.55
    fontVariation: "'wdth' 70"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 70"
  label-sm:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 70"
  method-cell:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 70"
  tape-label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "0.12em"
    fontVariation: "'wdth' 125"
  tape-label-app:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 70"
  data:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.75
    fontFeature: "'tnum'"
  data-md:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "'tnum'"
  data-sm:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    fontFeature: "'tnum'"
  data-xs:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "'tnum'"
  caption:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "'tnum'"
  data-display:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "clamp(28px, 3.2vw, 42px)"
    fontWeight: 500
    lineHeight: 1.05
    fontFeature: "'tnum'"
  code-numeral:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "'tnum'"
  status-code-md:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "'tnum'"
  status-code:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "'tnum'"
rounded:
  none: "0px"
  lamp: "50%"
spacing:
  hair: "3px"
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "28px"
  gutter: "clamp(16px, 4vw, 56px)"
  section: "clamp(40px, 5.5vw, 72px)"
components:
  button-send:
    backgroundColor: "{colors.cord}"
    textColor: "{colors.matte}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  env-tape:
    backgroundColor: "{colors.prod}"
    textColor: "{colors.matte}"
    typography: "{typography.tape-label}"
    rounded: "{rounded.none}"
    padding: "0 22px"
    height: "52px"
  env-tape-compact:
    backgroundColor: "{colors.prod}"
    textColor: "{colors.matte}"
    typography: "{typography.tape-label-app}"
    padding: "0 18px"
    height: "36px"
  channel-row:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 14px"
  channel-row-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  channel-label:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    padding: "2px 8px"
  url-bar:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    typography: "{typography.data-md}"
    rounded: "{rounded.none}"
    height: "44px"
  toggle-raw-pretty:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 14px"
  toggle-raw-pretty-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  theme-selector:
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "34px"
  theme-selector-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  theme-selector-narrow:
    height: "44px"
  cancel-stamp:
    textColor: "{colors.prod-text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 8px"
  kbd:
    textColor: "{colors.mute}"
    typography: "{typography.data-xs}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  live-lamp:
    backgroundColor: "{colors.cord}"
    rounded: "{rounded.lamp}"
    size: "9px"
---

# Design System: Patchbay

## Overview

**Creative North Star: "A Sessão de Estúdio Catalogada"**

Patchbay é o painel onde se liga uma entrada a uma saída com um cabo, à mão. O sistema trata cada request como um canal numerado de uma mesa de som, cada sinal aparece cru em tinta sobre fundo chapado, e cada peça de identidade carrega um código de catálogo como uma capa de disco. O mundo é a fusão de três referências escolhidas pelo autor: a ficha de faixas de estúdio (canais, etiquetas, fita), a estética de dados crus (barras finas, timecode, algarismos tabulares) e o catálogo gráfico (códigos PB, régua de cores).

A interface é de duas tintas. Cor só aparece quando quer dizer alguma coisa, e o código é fechado: quatro cores de fita para environment e classe de status, e um laranja de cabo para o que está vivo. Profundidade é feita com fios de 1px e inversão, nunca com sombra. A densidade é de ferramenta: linhas de 6–7px de respiro, colunas fixas, dado em mono tabular.

O cenário é um único desenvolvedor ao lado de um editor escuro, em sessões longas, por isso o escuro (preto fosco, tinta branca) é o padrão. O claro é o mesmo mundo invertido, não outro: papel `#f2f1ec` de fundo, tinta fosca, seleção ainda por inversão, fitas, lâmpada e cabo com as mesmas cores. Uma terceira opção, Sistema, acompanha o SO ao vivo. Recusa confirmada: o shell cinza com acento violeta e badges de método coloridos da categoria; nada fofo, nada hacker clichê (preto com verde/neon), nada genérico.

**Key Characteristics:**
- Fosco e tinta em hairlines de 1px, um cinza de apoio; escuro por padrão, claro como inversão do mesmo mundo.
- Cor é código: quatro fitas (dev/local/staging/prod = 2xx/3xx/4xx/5xx) e o laranja do cabo para estado vivo.
- Métodos HTTP monocromáticos.
- Seleção é inversão (fundo de tinta, texto na cor do fundo), nos dois temas.
- Archivo variável muda de largura conforme o papel; Red Hat Mono tabular para todo dado.
- Cantos retos; a única geometria própria é o corte reto em cada ponta da fita.

## Colors

Um campo neutro quente e quase sem croma, interrompido só por cores que carregam significado. As cores da marca são constantes; a interface usa tokens semânticos (`--bg`, `--ink`, `--dev-text`…) que mudam por tema.

### Primary
- **Laranja de Cabo** (cord, PB-108): reservado ao que está vivo. O botão Enviar, a request em voo, a conexão WebSocket ou SSE aberta (a lâmpada e o rótulo `WS` do canal conectado), o patch do logo. Também é o anel de foco do teclado, a única exceção ao "só vivo". Como preenchimento (Enviar, lâmpada, cabo do logo) é o mesmo nos dois temas; como texto usa `cord-text`, que no claro escurece para PB-118.

### Secondary
As quatro cores de fita formam um único código, sempre juntas na mesma ordem. Cada uma tem dois sentidos que nunca colidem na mesma peça: environment na fita do topo, classe de status no código e nas barras de frame.
- **Verde Dev** (dev, PB-104; texto claro PB-114): environment `dev`; status 2xx (o `201` grande da resposta).
- **Azul Local** (local, PB-105; texto claro PB-115): environment `local`; status 3xx.
- **Âmbar Staging** (staging, PB-106; texto claro PB-116): environment `staging`; status 4xx.
- **Vermelho Prod** (prod, PB-107; texto claro PB-117): environment `prod`; status 5xx; e o carimbo de request cancelada, com timeout ou falha.

Texto sobre qualquer fita, e sobre o botão Enviar, é sempre fosco (matte) nos dois temas, nunca branco.

### Neutral
Constantes de marca (PB-100 a PB-103): **Fosco** (matte), **Painel** (panel), **Fio** (rule), **Tinta** (paper), **Apoio** (dim). Usadas direto só onde algo não muda com o tema: texto sobre fita e Enviar, os quadros que mostram a marca em fundo fixo, os arquivos de logo. **Apoio em Papel** (dim-on-paper) é a legenda secundária desses quadros claros fixos, só em folhas de marca.

Papéis semânticos (escuro / claro, PB-110 a PB-113 para o claro):
- **Fundo** (bg / bg-light): fundo de tudo; fosco no escuro, papel no claro.
- **Superfície** (surface / surface-light): área recuada, um degrau do fundo.
- **Fio** (line / line-light): todas as linhas de 1px, divisores, scrollbar.
- **Tinta** (ink / ink-light): texto principal, chaves de JSON, aros, e o fundo da inversão.
- **Tinta 2** (ink-2 / ink-2-light): texto corrido longo, ledes, descrições, `pre` de body, log de frames.
- **Tinta 3** (ink-3 / ink-3-light): valores string dentro de JSON; o único "realce de sintaxe", feito só com valor.
- **Apoio** (mute / mute-light): texto secundário, timecodes, rótulos de metadado, contorno de toggle e seletor.
- **Foco** (focus / focus-light): anel de foco; laranja de cabo no escuro, PB-118 no claro.

### Named Rules
**The Color Is Code Rule.** Uma cor só entra na tela se carregar um dos cinco significados (environment, classe de status, vivo). Se der para apagar a cor sem perder informação, ela não devia estar lá.

**The Live Wire Rule.** O laranja do cabo marca o que está vivo e o foco do teclado. Nada mais: nem hover, nem destaque, nem erro.

**The Monochrome Method Rule.** GET, POST, PUT, PATCH, DEL ficam em tinta condensada. Método não é código de cor; a única exceção é um canal realtime (WS/SSE) conectado, que fica em `cord-text` porque está vivo.

**The Same World Inverted Rule.** O claro troca só o par fundo/tinta e seus degraus. Fitas, lâmpada, Enviar e o cabo do logo mantêm os preenchimentos da marca; a seleção continua sendo inversão. Não existe acento, cinza ou cor nova só do claro.

**The Fill Versus Text Rule.** Cor de código como preenchimento (fita, botão, lâmpada, chip) usa a cor da marca nos dois temas. Cor de código como texto ou borda de texto (status, carimbo, `WS`) usa a variante `*-text`, que no claro escurece para passar 4.5:1 sobre o papel. Na faixa de frames, as barras de staging usam `staging-text`, porque o âmbar cheio some no papel; as barras de cabo usam o preenchimento `cord`, que passa nos dois fundos.

**The Ink-Only Panel Rule.** No claro, texto colorido nunca fica sobre a superfície `surface-light` (`dev-text` cai para 4.28:1 e `cord-text` para 4.44:1 ali). Texto colorido mora no fundo; a superfície mostra só tinta.

## Typography

**Display Font:** Archivo variável, eixos `wdth` 62–125 e `wght` 400–800 (com system-ui)
**Body Font:** Archivo, `wdth` 100
**Label/Mono Font:** Red Hat Mono 400/500/600, sempre com algarismos tabulares (com ui-monospace)

**Character:** Uma família de interface que muda de largura como uma etiqueta de mesa muda de tamanho de fita: larga para títulos, condensada em caixa alta para canais. Ao lado, um mono sóbrio que cobre tudo que é dado.

### Hierarchy
- **Display** (700, `wdth` 112, clamp(40px, 5.4vw, 76px), 1): títulos de peça grandes; espécime.
- **Headline** (700, `wdth` 82, clamp(30px, 4vw, 52px), 1.05, `text-wrap: balance`): títulos de seção.
- **Title condensado** (700, `wdth` 62, caixa alta, clamp(28px, 3.4vw, 44px)): nome de canal em destaque.
- **Lede** (400, `wdth` 100, clamp(17px, 1.6vw, 20px)): parágrafo de abertura, até 62ch.
- **Body** (400, `wdth` 100, 16px, 1.55): texto de interface, ajuda, erros, descrições; até 64ch. 15px para notas de regra e títulos pequenos (h3).
- **Label** (700, `wdth` 70, 13px, 0.06em, caixa alta): métodos, nomes de canal, abas, toggles. 12px para cabeçalhos de grupo, bloco vivo e o seletor de tema; 17px para o método na barra de URL; 19px para o nome do environment na fita do app.
- **Tape label** (700, `wdth` 125, 20px, 0.12em, caixa alta): o nome do environment na fita grande; cai para `wdth` 66 / 17px em telas estreitas.
- **Data** (Red Hat Mono 400–500): 13px com 1.75 em blocos de body e metadados; 14px na URL e em tabelas; 12.5px no log de frames; 12px em kbd, códigos PB e histórico; 11px no timecode da régua.
- **Data display** (Red Hat Mono 500, clamp(28px, 3.2vw, 42px)): números de espécime; 28px/600 para amostras de cor de código.
- **Status code** (Red Hat Mono 600, 48px, 1): o código de status da resposta, colorido pela classe; 40px em comparativos compactos.

Os tamanhos fixos do sistema são 11, 12, 12.5, 13, 14, 15, 16, 17, 19, 20, 28, 40 e 48px, mais os quatro clamps acima. Nada fora disso.

### Named Rules
**The Width Is Role Rule.** Em Archivo, o papel escolhe a largura: larga (112–125) para títulos e fita, normal (100) para texto, condensada (62–82) para etiquetas e headlines. Não misture larguras dentro do mesmo papel.

**The Tabular Data Rule.** Todo número que pode mudar (status, ms, KB, timecode, índice de canal) é Red Hat Mono com `tabular-nums`, para que colunas não dancem.

## Layout

Grade de ferramenta em colunas fixas separadas por fios de 1px. O app é uma barra superior (lockup, fita de environment que ocupa o espaço livre, atalho ⌘K) sobre três colunas: trilho de canais (270px), editor de request (fluido) e resposta (450px). Colunas não flutuam como cards; são divididas por `border-right` em fio.

Ritmo: linhas de canal com 6–7px de respiro vertical e 14px lateral; painéis com 16–18px de padding; grupos separados por 16px. Folhas de marca usam gutter clamp(16px, 4vw, 56px) e seções com clamp(40px, 5.5vw, 72px) de respiro vertical, divididas por fio. Abaixo de 860px as grades de duas colunas viram uma e os alvos de toque do seletor de tema sobem para 44px.

Grades internas de tabela usam `gap: 1px` sobre fundo de fio para desenhar as divisórias, em vez de bordas por célula.

### Temas
- **Mecânica:** o tema resolvido vive em `data-theme="dark|light"` no `<html>`; a preferência (`dark | light | system`) é validada e cai para `dark` se for qualquer outra coisa. `system` resolve por `prefers-color-scheme` e escuta mudanças ao vivo. Cada bloco de tema declara `color-scheme` para que scrollbars e controles nativos acompanhem.
- **Sem flash:** um script inline no `<head>`, antes de qualquer CSS, lê a preferência e aplica `data-theme` antes do primeiro paint.
- **No app:** a preferência fica no `localStorage` da webview (configuração do app, não dado do workspace), e a barra de título do Tauri segue o tema resolvido. Trocar fica nas Configurações e na command palette ("Tema: Escuro / Claro / Sistema").
- **Ativos:** cada logo tem par `on-dark` / `on-light` (lockup, wordmark, wordmark empilhado); o tema oculta o par errado. Sem `data-theme`, vale o escuro. Favicon e ícone de app carregam o próprio fundo fosco e não trocam.
- **Escopo:** `data-theme` também pode ser posto num contêiner para forçar um tema localmente (comparativos lado a lado).

## Elevation & Depth

Sistema totalmente chapado. Não há sombra, brilho nem blur em parte alguma, incluindo a marca. Profundidade vem de três recursos: o degrau tonal fundo → superfície, fios de 1px, e a inversão para o que está selecionado ou ativo. As únicas `box-shadow` do build são réguas de 2px em tinta, em inset: sob a aba ativa e no hover de um botão não pressionado do seletor de tema. São sublinhados, não elevação.

### Named Rules
**The Flat Panel Rule.** Nada flutua. Se um elemento precisa se destacar, ele inverte ou ganha um fio; nunca ganha sombra. `box-shadow` só existe como régua inset de 2px em tinta.

**The Selection Is Inversion Rule.** O item ativo inverte para fundo de tinta com texto na cor do fundo, e sua etiqueta inverte de volta. Vale nos dois temas: no claro, a linha selecionada é preta. Nenhum azul de seleção, nenhum cinza de hover como estado. `::selection` de texto segue a mesma regra.

## Shapes

Cantos retos em toda a interface (0px). Círculos aparecem só onde o mundo físico é redondo: a lâmpada de conexão viva (9px), os jacks e plugues da marca. A forma própria do sistema é a **fita**: um retângulo com um único corte reto em cada ponta, o mesmo `clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)` (token `--cut`), como fita crepe rasgada na régua. Raio só existe nos arquivos de ícone (favicon rx 7/32, ícone de app rx 112/512) por exigência de plataforma.

O wordmark é desenhado à mão, não é fonte: traço monoline de 3 unidades numa grade de glifo de 12×20, avanço de 18 unidades, cantos de raio curto (3.5–4), caixa alta. Os SVGs em `brand/` são o desenho; nunca recomponha o nome em Archivo.

## Components

### Buttons
Ferramenta, não convite. Um botão só tem cor se dispara algo vivo.
- **Shape:** cantos retos (0px).
- **Enviar (primário):** fundo laranja de cabo, texto fosco, label condensada 16px, 0 16px de padding, encaixado à direita da barra de URL na mesma altura (44px), com o atalho `⌘↵` em mono ao lado. É o único botão laranja, igual nos dois temas.
- **Foco:** anel de 2px em `focus` com 3px de offset, global.
- **Secundários:** texto de tinta sobre fundo com fio; o ativo inverte.

### Chips
- **Atalho (kbd):** fio de 1px, texto de apoio em mono 12px, 2px 8px.
- **Toggle Raw/Pretty:** contorno de 1px em apoio, dois segmentos condensados 13px (5px 14px); o ativo inverte. Sempre visível em todo body, nunca num menu.

### Seletor de tema
Botões segmentados Escuro / Claro / Sistema num contorno de 1px em apoio, label condensada 12px, 34px de altura (44px abaixo de 860px). O pressionado (`aria-pressed="true"`) inverte; os não pressionados ganham a régua inset de 2px em tinta no hover; foco com anel de 2px a 2px de offset. A ordem e os nomes são fixos; Escuro é o padrão.

### Cards / Containers
- **Corner Style:** retos (0px).
- **Background:** fundo; superfície para áreas recuadas (só tinta sobre ela no claro).
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Border:** fio de 1px.
- **Internal Padding:** 16–18px no app; 28–32px em folhas de marca.

### Inputs / Fields
- **Barra de URL:** altura 44px, fio de 1px; à esquerda o método numa célula de 84px (condensado 17px, tinta) separada por fio; URL em mono 14px; Enviar à direita.
- **Variáveis:** `{{base}}` em tinta, peso 600, com sublinhado tracejado de 1px. Sem fundo colorido.
- **Abas:** condensadas 13px, gap 22px, inativas em apoio; a ativa em tinta com régua de 2px embaixo. Contadores entram no próprio rótulo (`Headers 3`).

### Navigation
- **Trilho de canais:** cabeçalhos de grupo condensados 12px em apoio (`Loja / usuários`). Cada linha é número do canal (mono, apoio) · método (condensado, tinta) · nome numa etiqueta de tinta com texto na cor do fundo. O canal selecionado inverte inteiro. Histórico usa o mesmo formato, com hora no lugar do número.
- **Command palette:** acessada por ⌘K, sinalizada pelo chip kbd na barra superior; também troca o tema.

### Fita de environment (assinatura)
Faixa preenchida com a cor do environment e o corte `--cut` nas pontas, texto fosco nos dois temas: nome do environment em tape label, base URL e contagem de variáveis em mono. Altura 52px na folha, 36px na barra do app (onde ocupa todo o espaço livre). Vermelha é produção, sem ambiguidade.

### Canais numerados (assinatura)
Toda request tem um número fixo de dois dígitos que é o seu índice; ⌘1 a ⌘9 pulam direto. O nome vive numa etiqueta de tinta, como fita numa mesa.

### Faixa de frames (assinatura)
No realtime, cada frame é uma barra fina (≈38% da célula) alinhada à base: altura pelo tamanho, cor pelo código. As barras usam classes que seguem o tema: tinta, laranja de cabo, `staging-text`. Novos frames entram pela direita a cada ~420ms enquanto a conexão está aberta; com `prefers-reduced-motion` a faixa fica estática. Abaixo, o log em mono: timecode `00:04:12:07` em apoio, direção `in`/`out` em apoio, payload em tinta 2.

### Carimbo de cancelamento (assinatura)
Requests abortadas, com timeout ou falhas ficam no histórico com um carimbo: borda de 2px e texto em `prod-text`, condensado 11–13px, 1px 8px. Nada some; tudo cancela.

### Resposta
Código de status em mono 600 48px na variante `*-text` da classe, frase de status condensada ao lado, toggle Raw/Pretty à direita, e uma linha de metadados em mono (rótulo em apoio, valor em tinta 500): tempo, tamanho, headers. Bloco "vivo" no rodapé com lâmpada laranja e o nome do canal conectado.

### Código de catálogo (assinatura de marca)
Em folhas e arquivos de identidade, cada peça leva um código `PB-nnn` em mono 12px de apoio, precedido pela régua de quatro chips (10×10px, gap 3px, na ordem dev, local, staging, prod, sempre com as cores de preenchimento). A régua é a legenda do código de cor; só aparece junto de um código PB.

## Do's and Don'ts

### Do:
- **Do** manter a interface em fundo e tinta, com cor só para environment, classe de status e estado vivo.
- **Do** usar o laranja de cabo para Enviar, request em voo, conexão aberta e anel de foco, e para nada mais.
- **Do** marcar seleção por inversão (fundo de tinta, texto na cor do fundo), nos dois temas.
- **Do** escrever todo número variável em Red Hat Mono tabular.
- **Do** escolher a largura de Archivo pelo papel: 112–125 larga, 100 texto, 62–82 condensada em caixa alta para etiquetas.
- **Do** cortar a fita com `--cut` (um corte reto de 10px em cada ponta) e pôr texto fosco sobre ela.
- **Do** dividir colunas e listas com fios de 1px em vez de cards ou sombras.
- **Do** manter Raw e Pretty lado a lado e visíveis em todo body.
- **Do** guardar requests canceladas no histórico com o carimbo vermelho.
- **Do** usar os SVGs de `brand/` para o nome, no par `on-dark` / `on-light` do tema; nunca recompor o wordmark em fonte.
- **Do** usar os tokens semânticos (`--bg`, `--ink`, `--line`, `--mute`, `--*-text`, `--focus`) em toda interface, e as constantes de marca só para preenchimentos que não mudam com o tema.
- **Do** usar a variante `*-text` sempre que uma cor de código vira texto ou borda de texto (e nas barras de staging da faixa de frames).
- **Do** aplicar o tema antes do primeiro paint e manter Escuro como padrão e fallback.

### Don't:
- **Don't** colorir métodos HTTP; só um canal realtime conectado fica laranja, por estar vivo.
- **Don't** usar o laranja de cabo como hover, destaque decorativo ou indicação de erro.
- **Don't** usar azul de seleção nem fundo cinza como estado ativo.
- **Don't** usar sombra, brilho, blur ou contorno extra, nem na interface nem na marca; `box-shadow` só como régua inset de 2px.
- **Don't** arredondar cantos de componentes; círculo só para lâmpada e jacks.
- **Don't** construir o shell cinza com acento violeta, nem preto com verde/neon de terminal de filme.
- **Don't** mudar a cor do cabo do logo; em fundo claro só os jacks e o wordmark viram tinta fosca.
- **Don't** usar a régua de quatro chips sem um código PB ao lado.
- **Don't** inventar cor, acento ou cinza só para o tema claro; ele é o mesmo mundo invertido.
- **Don't** pôr texto colorido sobre a superfície clara (`surface-light`); só tinta ali.
