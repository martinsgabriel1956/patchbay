import { useCallback, useEffect, useState } from "react";
import { ShortcutList } from "@/components/shortcuts";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CollectionDialog } from "@/features/environments/collection-dialog";
import { EnvBar, useCurrentEnvironments } from "@/features/environments/env-bar";
import { clearCookies, collectionEnvs, useEnvironments } from "@/features/environments/store";
import { RealtimeEditor } from "@/features/realtime/realtime-editor";
import { RealtimePanel } from "@/features/realtime/realtime-panel";
import { useRealtime } from "@/features/realtime/store";
import { RequestEditor } from "@/features/request-editor/request-editor";
import { closeTab, RequestTabs } from "@/features/request-editor/request-tabs";
import { activeTab, useRequest, where } from "@/features/request-editor/store";
import { STAMPS } from "@/features/response-viewer/diagnose";
import {
  focusResponseFilter,
  ResponseViewer,
  searchResponse,
} from "@/features/response-viewer/response-viewer";
import { RunnerDialog } from "@/features/runner/runner-dialog";
import { useRunner } from "@/features/runner/store";
import { SettingsDialog, THEMES } from "@/features/settings/settings-dialog";
import { useApplySettings, useSettings } from "@/features/settings/store";
import {
  channels,
  collapse,
  Notices,
  openChannel,
  openHistory,
  Sidebar,
  when,
} from "@/features/sidebar/sidebar";
import { useWorkspace } from "@/features/sidebar/store";
import {
  copyWebhookUrl,
  startWebhook,
  WebhookEditor,
  WebhookPanel,
} from "@/features/webhook/webhook";
import { api } from "@/lib/api-client";
import { type Dict, strings, useStrings } from "@/lib/i18n";
import { focusUrl, mod, modalOpen } from "@/lib/utils";

/** A request ativa, resolvida, como curl na área de transferência. Falha aparece na sidebar.
 *  ClipboardItem com promise: o WebKit (Tauri no Linux) só aceita escrever dentro do gesto do
 *  usuário, e o await que resolve as variáveis o perderia; writeText fica de reserva. */
const copyCurl = () => {
  const text = useRequest.getState().exportCurl();
  const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
  navigator.clipboard
    .write([new ClipboardItem({ "text/plain": blob })])
    .catch(() => text.then((t) => navigator.clipboard.writeText(t)))
    .catch((err) =>
      useWorkspace.setState({ error: `Copiar como cURL: ${(err as Error).message}` }),
    );
};

const PALETTE: Dict<{
  newWebhook: string;
  listen: string;
  stop: string;
  copyUrl: string;
  run: (folder: string) => string;
  lastRun: string;
  notSaved: string;
}> = {
  en: {
    newWebhook: "New webhook inspector",
    listen: "Webhook: listen",
    stop: "Webhook: stop",
    copyUrl: "Webhook: copy URL",
    run: (folder) => `Run requests in ${folder}`,
    lastRun: "Last run results",
    notSaved: "The webhook inspector is not saved to the workspace.",
  },
  "pt-BR": {
    newWebhook: "Novo inspetor de webhook",
    listen: "Webhook: escutar",
    stop: "Webhook: parar",
    copyUrl: "Webhook: copiar URL",
    run: (folder) => `Rodar requests de ${folder}`,
    lastRun: "Resultado da última execução",
    notSaved: "O inspetor de webhook não vai para o workspace.",
  },
};

// O inspetor de webhook só existe em aba: nada para salvar.
const save = () =>
  activeTab(useRequest.getState()).kind === "webhook"
    ? useWorkspace.setState({ notice: strings(PALETTE).notSaved })
    : useWorkspace.setState({ saving: true });

/** Ctrl Tab / Ctrl Shift Tab: próxima / anterior aba, dando a volta. */
const cycleTab = (step: number) => {
  const { tabs, activate } = useRequest.getState();
  const i = tabs.findIndex((t) => t.key === activeTab(useRequest.getState()).key);
  activate(tabs[(i + step + tabs.length) % tabs.length].key);
};

/** Ctrl E abre o seletor da fita (o mesmo do clique: setas e Enter escolhem, sem passar por prod
 *  às cegas). Ctrl Shift E pula direto para o próximo (passando por "nenhum"). */
const switchEnv = (cycle: boolean) => {
  const { collection, envs } = collectionEnvs(where(activeTab(useRequest.getState())));
  if (!collection) return;
  if (!envs.length)
    return useWorkspace.setState({
      notice: `${collection} não tem environments. Crie um no header.`,
    });
  if (!cycle) return useEnvironments.setState({ picking: true });
  const names = ["", ...envs.map((e) => e.name)];
  const current = useEnvironments.getState().active[collection] ?? "";
  const next = names[(names.indexOf(current) + 1) % names.length];
  useEnvironments.getState().select(collection, next || undefined);
};

/** Ctrl B: mostra o trilho já com o foco no canal ativo (ou no primeiro). */
const focusRail = () =>
  setTimeout(() =>
    (
      document.querySelector<HTMLElement>("#rail [aria-current=true]") ??
      document.querySelector<HTMLElement>("#rail [data-path]")
    )?.focus(),
  );

export function App() {
  useApplySettings();
  const update = useSettings((s) => s.update);
  const [health, setHealth] = useState<"…" | "ok" | "offline">("…");
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  // Trilho de canais: começa recolhido em janela estreita (lado a lado com o editor).
  const [rail, setRail] = useState(() => window.innerWidth >= 1200);
  const active = useRequest((s) => activeTab(s).key);
  const activePath = useRequest((s) => activeTab(s).path);
  const activeFolder = activePath?.split("/").slice(0, -1).join("/");
  const kind = useRequest((s) => activeTab(s).kind);
  const realtime = kind !== "http";
  const listening = useRealtime((s) => s.conns[active]?.status === "open");
  const ran = useRunner((s) => s.rows.length > 0);
  const t = useStrings(PALETTE);
  // Há uma resposta na tela e outra anterior desta aba para comparar.
  const comparable = useRequest((s) => {
    const tab = activeTab(s);
    return tab.result.state === "done" && (tab.past?.length ?? 0) > 1;
  });
  const tree = useWorkspace((s) => s.tree);
  const contents = useWorkspace((s) => s.contents);
  const { collection, env, envs } = useCurrentEnvironments();
  const theme = useSettings((s) => s.theme);
  const history = useWorkspace((s) => s.history);
  const list = channels(tree, contents);

  // A api é um processo à parte e pode cair depois de abrir: recheca ao voltar à janela e a cada 15s.
  const checkHealth = useCallback(
    () =>
      api("/health").then(
        () => setHealth("ok"),
        () => setHealth("offline"),
      ),
    [],
  );
  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 15_000);
    window.addEventListener("focus", checkHealth);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", checkHealth);
    };
  }, [checkHealth]);

  // Atalhos globais (PRODUCT.md › Toda ação tem atalho). Captura: vale dentro do CodeMirror.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // Com um diálogo aberto, só Ctrl K age (alterna a palette); o resto ficaria por baixo dele.
      // Ctrl S salva o formulário do próprio diálogo, se ele tiver um.
      if (k !== "k" && k !== "/" && modalOpen()) {
        if (k !== "s") return;
        e.preventDefault();
        document.querySelector<HTMLFormElement>('[role="dialog"] form')?.requestSubmit();
        return;
      }
      const req = useRequest.getState();
      const action =
        k === "k"
          ? () => setPalette((open) => !open)
          : k === "s"
            ? save
            : k === "e"
              ? () => switchEnv(e.shiftKey)
              : k === "b"
                ? () =>
                    setRail((open) => {
                      if (!open) focusRail();
                      return !open;
                    })
                : k === "t" && e.shiftKey
                  ? () => req.reopen()
                  : k === "t"
                    ? () => req.newTab()
                    : k === "w"
                      ? () => closeTab(activeTab(req).key)
                      : k === "l"
                        ? focusUrl
                        : // Dentro de um editor, Ctrl F é a busca dele (CodeMirror); fora, a da resposta.
                          k === "f" && !(e.target as HTMLElement).closest?.(".cm-editor")
                          ? searchResponse
                          : k === "/"
                            ? () => setHelp((open) => !open)
                            : e.key === "Tab"
                              ? () => cycleTab(e.shiftKey ? -1 : 1)
                              : /^[1-9]$/.test(e.key)
                                ? () => {
                                    const { tree, contents } = useWorkspace.getState();
                                    const entry = channels(tree, contents).find(
                                      (c) => c.channel === +e.key,
                                    );
                                    if (entry) openChannel(entry.path);
                                    else
                                      useWorkspace.setState({
                                        notice: `Nenhum canal ${e.key.padStart(2, "0")}.`,
                                      });
                                  }
                                : null;
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const run = (action: () => void) => () => {
    setPalette(false);
    action();
  };

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr]">
      <header className="flex h-14 items-center gap-4 border-b border-line px-[18px] max-[900px]:gap-2.5">
        <img src="/lockup.svg" alt="Patchbay" className="on-dark h-6 w-auto" />
        <img src="/lockup-light.svg" alt="Patchbay" className="on-light h-6 w-auto" />
        <button
          type="button"
          aria-pressed={rail}
          aria-controls="rail"
          title={`Mostrar ou ocultar coleções (${mod("B")})`}
          onClick={() => {
            if (!rail) focusRail();
            setRail(!rail);
          }}
          className="label h-[34px] shrink-0 border border-mute px-3 text-[12px] focus-visible:outline-offset-2 aria-pressed:bg-ink aria-pressed:text-bg aria-[pressed=false]:hover:shadow-[inset_0_-2px_var(--ink)]"
        >
          Coleções
        </button>
        <EnvBar />
        {/* Em janela estreita o texto vira só a lâmpada (o leitor de tela continua ouvindo). */}
        {health === "offline" ? (
          <button
            type="button"
            title="A api local não respondeu. Clique para verificar de novo."
            onClick={checkHealth}
            className="flex shrink-0 items-center gap-2 font-mono text-[12px] text-prod-text underline decoration-dashed underline-offset-4"
          >
            <span className="size-[9px] rounded-full bg-prod-text" />
            <span className="max-[1100px]:sr-only">api offline · verificar</span>
          </button>
        ) : (
          <span
            role="status"
            title={`api ${health}`}
            className="flex shrink-0 items-center gap-2 font-mono text-[12px] text-mute tabular-nums"
          >
            <span className="size-[9px] rounded-full border border-mute" />
            <span className="max-[1100px]:sr-only">api {health}</span>
          </span>
        )}
        <button
          type="button"
          aria-label={`Command palette (${mod("K")})`}
          title="Command palette: todos os comandos"
          className="kbd shrink-0"
          onClick={() => setPalette(true)}
        >
          {mod("K")}
        </button>
        <button
          type="button"
          className="label h-[34px] shrink-0 px-1 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
          onClick={() => setSettings(true)}
        >
          Configurações
        </button>
      </header>

      <div>
        <Notices />
      </div>

      <main
        className={`grid min-h-0 ${rail ? "grid-cols-[clamp(270px,22vw,340px)_minmax(0,1fr)]" : "grid-cols-1"}`}
      >
        {/* Recolhido fica montado (hidden): a sidebar também atende Ctrl S e o import. */}
        <section
          id="rail"
          aria-label="Coleções e histórico"
          className={`min-h-0 border-r border-line ${rail ? "" : "hidden"}`}
        >
          <Sidebar />
        </section>
        {/* Request e resposta lado a lado quando cabem; abaixo de ~1000px, empilhadas (a URL
            não fica espremida em janela dividida). */}
        <div className="@container min-h-0 min-w-0">
          <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] @min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] @min-[1000px]:grid-rows-1">
            <section
              aria-label="Request"
              className="flex min-h-0 flex-col border-b border-line @min-[1000px]:border-r @min-[1000px]:border-b-0"
            >
              <RequestTabs />
              {/* key: cada aba tem o próprio editor (cursor, undo, aba interna) */}
              <div className="min-h-0 flex-1">
                {kind === "webhook" ? (
                  <WebhookEditor key={active} />
                ) : realtime ? (
                  <RealtimeEditor key={active} />
                ) : (
                  <RequestEditor key={active} />
                )}
              </div>
            </section>
            <section id="response" aria-label="Resposta" className="min-h-0">
              {kind === "webhook" ? (
                <WebhookPanel key={active} />
              ) : realtime ? (
                <RealtimePanel />
              ) : (
                <ResponseViewer key={active} />
              )}
            </section>
          </div>
        </div>
      </main>

      <CommandDialog title="Command palette" open={palette} onOpenChange={setPalette}>
        <CommandInput placeholder="Comando ou request…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Request">
            {!realtime && (
              <CommandItem onSelect={run(() => useRequest.getState().send())}>
                Enviar request <CommandShortcut>{mod("↵")}</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={run(save)}>
              Salvar <CommandShortcut>{mod("S")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => useRequest.getState().newTab())}>
              Nova request <CommandShortcut>{mod("T")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => useRequest.getState().newTab("ws"))}>
              Nova request WebSocket
            </CommandItem>
            <CommandItem onSelect={run(() => useRequest.getState().newTab("sse"))}>
              Nova request SSE
            </CommandItem>
            <CommandItem onSelect={run(() => useRequest.getState().newTab("webhook"))}>
              {t.newWebhook}
            </CommandItem>
            {kind === "webhook" &&
              (listening ? (
                <>
                  <CommandItem onSelect={run(copyWebhookUrl)}>{t.copyUrl}</CommandItem>
                  <CommandItem onSelect={run(() => useRealtime.getState().disconnect(active))}>
                    {t.stop}
                  </CommandItem>
                </>
              ) : (
                <CommandItem onSelect={run(() => startWebhook(active))}>
                  {t.listen} <CommandShortcut>{mod("↵")}</CommandShortcut>
                </CommandItem>
              ))}
            <CommandItem onSelect={run(() => closeTab(active))}>
              Fechar aba <CommandShortcut>{mod("W")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => useRequest.getState().reopen())}>
              Reabrir aba fechada <CommandShortcut>{mod("Shift T")}</CommandShortcut>
            </CommandItem>
            {!realtime && <CommandItem onSelect={run(copyCurl)}>Copiar como cURL</CommandItem>}
            {!realtime && (
              <>
                <CommandItem onSelect={run(() => clearCookies(collection, env))}>
                  Limpar cookies de {env ?? "sem environment"}
                </CommandItem>
                <CommandItem onSelect={run(() => setTimeout(searchResponse))}>
                  Buscar na resposta <CommandShortcut>{mod("F")}</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={run(() => setTimeout(focusResponseFilter))}>
                  Filtrar o JSON da resposta
                </CommandItem>
              </>
            )}
            {comparable && (
              <CommandItem onSelect={run(() => useRequest.setState({ comparing: true }))}>
                Comparar resposta com…
              </CommandItem>
            )}
          </CommandGroup>

          {list.length > 0 && (
            <CommandGroup heading="Requests salvas">
              {list.map((entry) => {
                const n = entry.channel;
                const content = contents[entry.path] as { method?: string; kind?: string } | null;
                const method =
                  content?.kind === "ws" || content?.kind === "sse"
                    ? content.kind.toUpperCase()
                    : (content?.method ?? "");
                return (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    keywords={[method, `${n ?? ""}`]}
                    aria-label={`Request ${n ?? "sem número"}: ${method} ${entry.path.replace(/\.json$/, "")}`}
                    onSelect={run(() => {
                      openChannel(entry.path);
                      setTimeout(focusUrl);
                    })}
                  >
                    <span className="font-mono text-[12px] font-normal tabular-nums">
                      {n ? String(n).padStart(2, "0") : "--"}
                    </span>
                    <span className="w-9">{method === "DELETE" ? "DEL" : method}</span>
                    <span className="min-w-0 truncate tracking-normal normal-case">
                      {entry.path.replace(/\.json$/, "")}
                    </span>
                    {n && n < 10 && <CommandShortcut>{mod(String(n))}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {collection && (
            <CommandGroup heading={`Environment de ${collection} (${mod("E")} troca)`}>
              {[{ name: "" }, ...envs].map(({ name }) => (
                <CommandItem
                  key={`env-${name}`}
                  onSelect={run(() =>
                    useEnvironments.getState().select(collection, name || undefined),
                  )}
                >
                  Environment: {name || "nenhum"}
                  {(env ?? "") === name && <CommandShortcut>atual</CommandShortcut>}
                </CommandItem>
              ))}
              <CommandItem onSelect={run(() => useEnvironments.getState().edit(collection))}>
                Editar environments de {collection}
              </CommandItem>
              <CommandItem onSelect={run(() => useRunner.getState().run(collection))}>
                {t.run(collection)}
              </CommandItem>
              {activeFolder && activeFolder !== collection && (
                <CommandItem onSelect={run(() => useRunner.getState().run(activeFolder))}>
                  {t.run(activeFolder)}
                </CommandItem>
              )}
              {ran && (
                <CommandItem onSelect={run(() => useRunner.setState({ open: true }))}>
                  {t.lastRun}
                </CommandItem>
              )}
            </CommandGroup>
          )}

          <CommandGroup
            heading={activePath ? `Request ${activePath.replace(/\.json$/, "")}` : "Arquivos"}
          >
            {activePath && (
              <>
                <CommandItem
                  onSelect={run(() =>
                    useWorkspace.setState({ op: { kind: "rename", path: activePath } }),
                  )}
                >
                  Renomear / mover <CommandShortcut>F2</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={run(() =>
                    useWorkspace.setState({ op: { kind: "duplicate", path: activePath } }),
                  )}
                >
                  Duplicar
                </CommandItem>
                <CommandItem
                  onSelect={run(() =>
                    useWorkspace.setState({ op: { kind: "delete", path: activePath } }),
                  )}
                >
                  Deletar <CommandShortcut>Delete</CommandShortcut>
                </CommandItem>
              </>
            )}
            <CommandItem
              onSelect={run(() =>
                useWorkspace.setState({ op: { kind: "newCollection", path: "" } }),
              )}
            >
              Nova coleção
            </CommandItem>
            {collection && (
              <CommandItem
                onSelect={run(() =>
                  useWorkspace.setState({ op: { kind: "newFolder", path: collection } }),
                )}
              >
                Nova pasta em {collection}
              </CommandItem>
            )}
          </CommandGroup>

          {history.length > 0 && (
            <CommandGroup heading="Histórico">
              {collapse(history.slice(0, 60)).map(({ entry, count }, i) => (
                <CommandItem
                  // biome-ignore lint/suspicious/noArrayIndexKey: entradas não têm id
                  key={`h-${entry.at}-${i}`}
                  // O que a linha mostra é o que a busca acha (hora, método, URL, status ou carimbo);
                  // #n só desempata linhas iguais.
                  value={`${when(entry.at)} ${entry.request.method} ${entry.request.url} ${entry.failed ? STAMPS[entry.failed.reason] : entry.response?.status} #${i}`}
                  onSelect={run(() => {
                    openHistory(entry.request);
                    setTimeout(focusUrl);
                  })}
                >
                  <span className="w-11 font-mono text-[12px] font-normal tabular-nums">
                    {when(entry.at)}
                  </span>
                  <span className="w-9">
                    {entry.request.method === "DELETE" ? "DEL" : entry.request.method}
                  </span>
                  <span className="min-w-0 truncate font-mono text-[12px] font-normal tracking-normal normal-case">
                    {entry.request.url}
                  </span>
                  <CommandShortcut>
                    {count > 1 && `×${count} `}
                    {entry.failed ? STAMPS[entry.failed.reason] : entry.response?.status}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="App">
            <CommandItem onSelect={run(() => setHelp(true))}>
              Atalhos <CommandShortcut>{mod("/")}</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={run(() => {
                if (!rail) focusRail();
                setRail(!rail);
              })}
            >
              {rail ? "Ocultar coleções" : "Mostrar coleções"}
              <CommandShortcut>{mod("B")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(focusUrl)}>
              Ir para a URL <CommandShortcut>{mod("L")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => useWorkspace.setState({ importing: true }))}>
              Importar coleção (Postman, Insomnia, OpenAPI)
            </CommandItem>
            {THEMES.map(([value, name]) => (
              <CommandItem key={value} onSelect={run(() => update({ theme: value }))}>
                Tema: {name}
                {value === theme && <CommandShortcut>atual</CommandShortcut>}
              </CommandItem>
            ))}
            <CommandItem onSelect={run(() => setSettings(true))}>Abrir configurações</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <SettingsDialog open={settings} onOpenChange={setSettings} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto p-[18px] sm:max-w-lg">
          <DialogTitle>Atalhos</DialogTitle>
          <DialogDescription className="sr-only">Todos os atalhos de teclado</DialogDescription>
          <ShortcutList />
        </DialogContent>
      </Dialog>
      <CollectionDialog />
      <RunnerDialog />
      <ConfirmDialog />
    </div>
  );
}
