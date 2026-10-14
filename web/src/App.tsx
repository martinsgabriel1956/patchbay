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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CollectionDialog } from "@/features/environments/collection-dialog";
import { EnvBar, useCurrentEnvironments } from "@/features/environments/env-bar";
import { useEnvironments } from "@/features/environments/store";
import { RealtimeEditor } from "@/features/realtime/realtime-editor";
import { RealtimePanel } from "@/features/realtime/realtime-panel";
import { RequestEditor } from "@/features/request-editor/request-editor";
import { closeTab, RequestTabs } from "@/features/request-editor/request-tabs";
import { activeTab, useRequest } from "@/features/request-editor/store";
import { ResponseViewer } from "@/features/response-viewer/response-viewer";
import { SettingsDialog, THEMES } from "@/features/settings/settings-dialog";
import { useApplySettings, useSettings } from "@/features/settings/store";
import { channels, openChannel, Sidebar } from "@/features/sidebar/sidebar";
import { useWorkspace } from "@/features/sidebar/store";
import { api } from "@/lib/api-client";
import { focusUrl, mod } from "@/lib/utils";

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

const save = () => useWorkspace.setState({ saving: true });

/** Ctrl Tab / Ctrl Shift Tab: próxima / anterior aba, dando a volta. */
const cycleTab = (step: number) => {
  const { tabs, activate } = useRequest.getState();
  const i = tabs.findIndex((t) => t.key === activeTab(useRequest.getState()).key);
  activate(tabs[(i + step + tabs.length) % tabs.length].key);
};

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
  const realtime = useRequest((s) => activeTab(s).kind !== "http");
  const tree = useWorkspace((s) => s.tree);
  const contents = useWorkspace((s) => s.contents);
  const { collection, envs } = useCurrentEnvironments();
  const list = channels(tree);

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
      const req = useRequest.getState();
      const action =
        k === "k"
          ? () => setPalette((open) => !open)
          : k === "s"
            ? save
            : k === "b"
              ? () => setRail((open) => !open)
              : k === "t"
                ? () => req.newTab()
                : k === "w"
                  ? () => closeTab(activeTab(req).key)
                  : k === "l"
                    ? focusUrl
                    : k === "/"
                      ? () => setHelp((open) => !open)
                      : e.key === "Tab"
                        ? () => cycleTab(e.shiftKey ? -1 : 1)
                        : /^[1-9]$/.test(e.key)
                          ? () => {
                              const entry = channels(useWorkspace.getState().tree)[+e.key - 1];
                              if (entry) openChannel(entry.path);
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
    <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr]">
      <header className="flex items-center gap-4 border-b border-line px-[18px] py-2.5">
        <img src="/lockup.svg" alt="Patchbay" className="on-dark h-6 w-auto" />
        <img src="/lockup-light.svg" alt="Patchbay" className="on-light h-6 w-auto" />
        <button
          type="button"
          aria-pressed={rail}
          aria-controls="rail"
          title={`Mostrar ou ocultar coleções (${mod("B")})`}
          onClick={() => setRail(!rail)}
          className="label h-[34px] shrink-0 border border-mute px-3 text-[12px] focus-visible:outline-offset-2 aria-pressed:bg-ink aria-pressed:text-bg aria-[pressed=false]:hover:shadow-[inset_0_-2px_var(--ink)]"
        >
          Coleções
        </button>
        <EnvBar />
        {health === "offline" ? (
          <button
            type="button"
            title="A api local não respondeu. Clique para verificar de novo."
            onClick={checkHealth}
            className="font-mono text-[12px] text-prod-text underline decoration-dashed underline-offset-4"
          >
            api offline · verificar
          </button>
        ) : (
          <span role="status" className="font-mono text-[12px] text-mute tabular-nums">
            api {health}
          </span>
        )}
        <button type="button" className="kbd" onClick={() => setPalette(true)}>
          {mod("K")}
        </button>
        <button type="button" className="label text-[12px]" onClick={() => setSettings(true)}>
          Configurações
        </button>
      </header>

      <main
        className={`grid min-h-0 ${rail ? "grid-cols-[clamp(270px,22vw,340px)_minmax(0,1fr)]" : "grid-cols-1"}`}
      >
        {/* Recolhido fica montado (hidden): a sidebar também atende Ctrl S e o import. */}
        <section
          id="rail"
          aria-label="Canais"
          className={`min-h-0 border-r border-line ${rail ? "" : "hidden"}`}
        >
          <Sidebar />
        </section>
        {/* Request e resposta lado a lado quando cabem; abaixo de ~800px, empilhadas. */}
        <div className="@container min-h-0 min-w-0">
          <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] @min-[800px]:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] @min-[800px]:grid-rows-1">
            <section
              aria-label="Request"
              className="flex min-h-0 flex-col border-b border-line @min-[800px]:border-r @min-[800px]:border-b-0"
            >
              <RequestTabs />
              {/* key: cada aba tem o próprio editor (cursor, undo, aba interna) */}
              <div className="min-h-0 flex-1">
                {realtime ? <RealtimeEditor key={active} /> : <RequestEditor key={active} />}
              </div>
            </section>
            <section aria-label="Resposta" className="min-h-0">
              {realtime ? <RealtimePanel /> : <ResponseViewer key={active} />}
            </section>
          </div>
        </div>
      </main>

      <CommandDialog
        title="Command palette"
        open={palette}
        onOpenChange={setPalette}
        // O foco não cai no <body> ao fechar: volta para a URL, a menos que outro diálogo o pegou.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => {
            if (document.activeElement === document.body) focusUrl();
          });
        }}
      >
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
            <CommandItem onSelect={run(() => closeTab(active))}>
              Fechar aba <CommandShortcut>{mod("W")}</CommandShortcut>
            </CommandItem>
            {!realtime && <CommandItem onSelect={run(copyCurl)}>Copiar como cURL</CommandItem>}
          </CommandGroup>

          {list.length > 0 && (
            <CommandGroup heading="Canais">
              {list.map((entry, i) => {
                const content = contents[entry.path] as { method?: string; kind?: string } | null;
                const method =
                  content?.kind === "ws" || content?.kind === "sse"
                    ? content.kind.toUpperCase()
                    : (content?.method ?? "");
                return (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    keywords={[method, `${i + 1}`]}
                    aria-label={`Canal ${i + 1}: ${method} ${entry.path.replace(/\.json$/, "")}`}
                    onSelect={run(() => openChannel(entry.path))}
                  >
                    <span className="font-mono text-[12px] font-normal tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="w-9">{method === "DELETE" ? "DEL" : method}</span>
                    <span className="min-w-0 truncate normal-case">
                      {entry.path.replace(/\.json$/, "")}
                    </span>
                    {i < 9 && <CommandShortcut>{mod(String(i + 1))}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {collection && (
            <CommandGroup heading={`Environment de ${collection}`}>
              {[{ name: "" }, ...envs].map(({ name }) => (
                <CommandItem
                  key={`env-${name}`}
                  onSelect={run(() =>
                    useEnvironments.getState().select(collection, name || undefined),
                  )}
                >
                  Environment: {name || "nenhum"}
                </CommandItem>
              ))}
              <CommandItem onSelect={run(() => useEnvironments.getState().edit(collection))}>
                Editar environments de {collection}
              </CommandItem>
            </CommandGroup>
          )}

          <CommandGroup
            heading={activePath ? `Canal ${activePath.replace(/\.json$/, "")}` : "Arquivos"}
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

          <CommandGroup heading="App">
            <CommandItem onSelect={run(() => setHelp(true))}>
              Atalhos <CommandShortcut>{mod("/")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => setRail(!rail))}>
              {rail ? "Ocultar coleções" : "Mostrar coleções"}
              <CommandShortcut>{mod("B")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(focusUrl)}>
              Ir para a URL <CommandShortcut>{mod("L")}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => useWorkspace.setState({ importing: true }))}>
              Importar coleção (Postman, Insomnia)
            </CommandItem>
            {THEMES.map(([theme, name]) => (
              <CommandItem key={theme} onSelect={run(() => update({ theme }))}>
                Tema: {name}
              </CommandItem>
            ))}
            <CommandItem onSelect={run(() => setSettings(true))}>Abrir configurações</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <SettingsDialog open={settings} onOpenChange={setSettings} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="gap-4 p-[18px]">
          <DialogTitle>Atalhos</DialogTitle>
          <DialogDescription className="sr-only">Todos os atalhos de teclado</DialogDescription>
          <ShortcutList />
        </DialogContent>
      </Dialog>
      <CollectionDialog />
    </div>
  );
}
